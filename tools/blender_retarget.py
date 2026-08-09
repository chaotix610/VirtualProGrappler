"""
Bakes the Quaternius Universal Animation Library onto the Universal Base
Characters and exports one self-contained GLB per character.

Run headless from the project root:

    blender --background --python tools/blender_retarget.py

Why this exists
---------------
The characters ship with zero animations; the clips live on a separate
mannequin GLB. The two rigs share identical bone names and hierarchy (65
joints), but 62 of those 65 bones have *different rest poses* - the neck
differs by roughly 17 degrees. Every clip also writes full
translation+rotation+scale on all 65 bones.

So copying animation channels across directly is wrong twice over: it drags
the character onto the mannequin's proportions, and it poses bones away from
the rest pose its mesh was skinned against, which distorts the deformation.

The fix is to retarget as a *delta from each rig's own rest pose*. Blender
bone constraints in LOCAL/LOCAL space express exactly that: a pose bone's
local transform is already relative to its rest, so copying it applies the
mannequin's motion on top of the character's neutral pose. The result is
baked to keyframes and the constraints are dropped.
"""

import math
import os
import sys

import bpy

PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(PROJECT, "assets", "source")
SRC = os.path.join(ASSETS, "quaternius")
CHAR_DIR = os.path.join(SRC, "universal-base-characters", "Base Characters", "Godot - UE")
OUT_DIR = os.path.join(PROJECT, "assets", "runtime", "models")

# Two animation libraries, both built on the same 65-bone rig. UAL2's rest
# pose is byte-identical to UAL1's, so clips from either retarget the same way.
LIBRARIES = {
    "UAL1": os.path.join(SRC, "universal-animation-library", "UAL1_Standard.glb"),
    "UAL2": os.path.join(ASSETS, "universal-animation-library-2",
                         "Unreal-Godot", "UAL2_Standard.glb"),
}

# Clips the game uses, grouped by the library that provides them. Neither
# library ships a kick, so Sword_Attack still stands in for it.
CLIPS = {
    "UAL1": [
        "Idle_Loop",
        "Walk_Loop",
        "Sprint_Loop",
        "Jump_Start",
        "Jump_Loop",
        "Jump_Land",
        "Punch_Cross",
        "Sword_Attack",  # stands in for the kick
        "Roll",
        # Torso thrown backwards. Played with the wrestler's back to the
        # ropes, it reads as absorbing them before springing off.
        "Hit_Chest",
        "Crouch_Idle_Loop",  # perched on the top turnbuckle
    ],
    "UAL2": [
        "Sword_Block",  # a real block, unlike UAL1's guard-stance stand-in
        # Top-rope sequence: climb the corner, then launch, fly and land.
        "ClimbUp_1m",
        "NinjaJump_Start",
        "NinjaJump_Idle_Loop",
        "NinjaJump_Land",
    ],
}

CHARACTERS = [
    ("Superhero_Male_FullBody.gltf", "Superhero_Male.glb"),
    ("Superhero_Female_FullBody.gltf", "Superhero_Female.glb"),
]

# Bones whose translation carries real motion. Copying translation on every
# bone would rescale the character to the mannequin's bone lengths.
LOC_BONES = {"root", "pelvis"}


def ui_override():
    """Context for glTF import/export and nla.bake.

    Driven interactively (e.g. over the MCP bridge) the context is restricted
    and lacks `bpy.context.object`, which makes the glTF importer fail in
    `armature_display()`; supplying a real window/area fixes it. Under
    `--background` there are no windows at all, so return only the scene bits
    and let the operators use the default context.
    """
    base = dict(scene=bpy.context.scene, view_layer=bpy.context.view_layer)

    windows = bpy.context.window_manager.windows
    if not len(windows):
        return base

    win = windows[0]
    area = next((a for a in win.screen.areas if a.type == "VIEW_3D"), win.screen.areas[0])
    region = next((r for r in area.regions if r.type == "WINDOW"), area.regions[-1])
    base.update(window=win, area=area, region=region)
    return base


def wipe():
    """Clear the scene by removing datablocks.

    Never use wm.read_factory_settings() here: it resets preferences, which
    disables addons - including the MCP bridge when driving this interactively.
    """
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in (bpy.data.actions, bpy.data.armatures, bpy.data.meshes):
        for item in list(coll):
            coll.remove(item)


def assign_action(obj, name):
    act = bpy.data.actions[name]
    ad = obj.animation_data or obj.animation_data_create()
    ad.action = act
    # Blender 4.4+ slotted actions: without binding the slot the action
    # evaluates to nothing.
    if hasattr(ad, "action_slot") and len(act.slots):
        ad.action_slot = act.slots[0]
    return act


def build_constraints(char, mann):
    for pb in char.pose.bones:
        for c in list(pb.constraints):
            pb.constraints.remove(c)

        rot = pb.constraints.new("COPY_ROTATION")
        rot.target, rot.subtarget = mann, pb.name
        rot.target_space = rot.owner_space = "LOCAL"

        if pb.name in LOC_BONES:
            loc = pb.constraints.new("COPY_LOCATION")
            loc.target, loc.subtarget = mann, pb.name
            loc.target_space = loc.owner_space = "LOCAL"


def bake_clip(char, mann, name):
    src = assign_action(mann, name)
    end = int(math.ceil(src.frame_range[1]))
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 0, end

    if char.animation_data:
        char.animation_data.action = None

    for o in bpy.data.objects:
        o.select_set(False)
    char.select_set(True)
    bpy.context.view_layer.objects.active = char

    ov = ui_override()
    ov.update(active_object=char, selected_objects=[char], object=char)
    with bpy.context.temp_override(**ov):
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.select_all(action="SELECT")
        bpy.ops.nla.bake(
            frame_start=0,
            frame_end=end,
            step=1,
            only_selected=False,
            visual_keying=True,
            clear_constraints=False,
            clear_parents=False,
            use_current_action=False,
            bake_types={"POSE"},
        )
        baked = char.animation_data.action
        bpy.ops.object.mode_set(mode="OBJECT")

    baked.name = "BK_" + name
    baked.use_fake_user = True
    return baked, end


def drop_source_rig(char):
    """Remove the mannequin, its mesh, the importer's bone-display helpers,
    and every action that is not one of our bakes."""
    for obj in list(bpy.data.objects):
        if obj is char or obj.parent is char:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)

    if char.animation_data:
        char.animation_data.action = None
    for a in list(bpy.data.actions):
        if not a.name.startswith("BK_"):
            bpy.data.actions.remove(a)


def process(char_file, out_file):
    wipe()

    with bpy.context.temp_override(**ui_override()):
        bpy.ops.import_scene.gltf(filepath=os.path.join(CHAR_DIR, char_file))
    bpy.data.objects["Armature"].name = "CharRig"
    char = bpy.data.objects["CharRig"]

    # Each library is imported, harvested and discarded in turn. Purging its
    # actions before the next import also avoids name collisions, since both
    # libraries contain e.g. A_TPose.
    for lib, clips in CLIPS.items():
        with bpy.context.temp_override(**ui_override()):
            bpy.ops.import_scene.gltf(filepath=LIBRARIES[lib])
        mann = bpy.data.objects["Armature"]

        # The importer pushes every clip to an NLA track; unmuted they would
        # all evaluate simultaneously.
        for tr in mann.animation_data.nla_tracks:
            tr.mute = True

        build_constraints(char, mann)

        for name in clips:
            _, end = bake_clip(char, mann, name)
            print("  baked %-16s 0..%-4d (%s)" % (name, end, lib))

        # Constraints have done their job; motion now lives in keyframes.
        for pb in char.pose.bones:
            for c in list(pb.constraints):
                pb.constraints.remove(c)

        drop_source_rig(char)

    for a in list(bpy.data.actions):
        a.name = a.name[3:]

    # One NLA track per clip is the reliable way to get multiple glTF
    # animations out of the exporter.
    ad = char.animation_data or char.animation_data_create()
    ad.action = None
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for a in sorted(bpy.data.actions, key=lambda x: x.name):
        track = ad.nla_tracks.new()
        track.name = a.name
        strip = track.strips.new(a.name, 0, a)
        strip.name = a.name
        if hasattr(strip, "action_slot") and len(a.slots):
            strip.action_slot = a.slots[0]
        track.mute = False

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, out_file)

    for o in bpy.data.objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = char

    with bpy.context.temp_override(**ui_override()):
        bpy.ops.export_scene.gltf(
            filepath=out,
            export_format="GLB",
            use_selection=False,
            export_animations=True,
            export_animation_mode="NLA_TRACKS",
            export_bake_animation=True,
            export_optimize_animation_size=False,
            export_skins=True,
            export_morph=False,
            export_apply=False,
        )
    print("  wrote %s (%.1f MB)" % (out, os.path.getsize(out) / 1e6))


def main():
    if not os.path.isdir(SRC):
        sys.exit("Source assets not found at %s" % SRC)
    for lib, path in LIBRARIES.items():
        if not os.path.isfile(path):
            sys.exit("Animation library %s not found at %s" % (lib, path))
    for char_file, out_file in CHARACTERS:
        print("=== %s -> %s" % (char_file, out_file))
        process(char_file, out_file)
    print("done")


if __name__ == "__main__":
    main()
