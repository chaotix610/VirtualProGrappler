import{a6 as e}from"./index-C6WtG_Ky.js";const r="meshUboDeclaration",s=`struct Mesh {world : mat4x4<f32>,
visibility : f32,};var<uniform> mesh : Mesh;
#define WORLD_UBO
`;e.IncludesShadersStoreWGSL[r]||(e.IncludesShadersStoreWGSL[r]=s);const a="mainUVVaryingDeclaration",n=`#ifdef MAINUV{X}
varying vMainUV{X}: vec2f;
#endif
`;e.IncludesShadersStoreWGSL[a]||(e.IncludesShadersStoreWGSL[a]=n);
//# sourceMappingURL=mainUVVaryingDeclaration-BsNVmDYl.js.map
