import{aa as e}from"./index-C3G0Z6z7.js";const n="sceneUboDeclaration",o=`struct Scene {viewProjection : mat4x4<f32>,
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
//# sourceMappingURL=logDepthDeclaration-CGxO1TKy.js.map
