import{a6 as e}from"./index-BpLpSt5r.js";const n="sceneUboDeclaration",o=`struct Scene {viewProjection : mat4x4<f32>,
#ifdef MULTIVIEW
viewProjectionR : mat4x4<f32>,
#endif 
view : mat4x4<f32>,
projection : mat4x4<f32>,
vEyePosition : vec4<f32>,};
#define SCENE_UBO
var<uniform> scene : Scene;
`;e.IncludesShadersStoreWGSL[n]||(e.IncludesShadersStoreWGSL[n]=o);const t="logDepthDeclaration",r=`#ifdef LOGARITHMICDEPTH
uniform logarithmicDepthConstant: f32;varying vFragmentDepth: f32;
#endif
`;e.IncludesShadersStoreWGSL[t]||(e.IncludesShadersStoreWGSL[t]=r);
//# sourceMappingURL=logDepthDeclaration-2ICsOvbU.js.map
