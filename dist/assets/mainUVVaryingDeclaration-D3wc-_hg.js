import{aa as e}from"./index-C3G0Z6z7.js";const a="meshUboDeclaration",s=`struct Mesh {world : mat4x4<f32>,
visibility : f32,};var<uniform> mesh : Mesh;
#define WORLD_UBO
`;e.IncludesShadersStoreWGSL[a]||(e.IncludesShadersStoreWGSL[a]=s);const r="mainUVVaryingDeclaration",n=`#ifdef MAINUV{X}
varying vMainUV{X}: vec2f;
#endif
`;e.IncludesShadersStoreWGSL[r]||(e.IncludesShadersStoreWGSL[r]=n);
//# sourceMappingURL=mainUVVaryingDeclaration-D3wc-_hg.js.map
