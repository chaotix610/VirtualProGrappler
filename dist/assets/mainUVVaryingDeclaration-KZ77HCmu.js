import{a6 as e}from"./index-BpLpSt5r.js";const i="meshUboDeclaration",o=`#ifdef WEBGL2
uniform mat4 world;uniform float visibility;
#else
layout(std140,column_major) uniform;uniform Mesh
{mat4 world;float visibility;};
#endif
#define WORLD_UBO
`;e.IncludesShadersStore[i]||(e.IncludesShadersStore[i]=o);const a="mainUVVaryingDeclaration",r=`#ifdef MAINUV{X}
varying vec2 vMainUV{X};
#endif
`;e.IncludesShadersStore[a]||(e.IncludesShadersStore[a]=r);
//# sourceMappingURL=mainUVVaryingDeclaration-KZ77HCmu.js.map
