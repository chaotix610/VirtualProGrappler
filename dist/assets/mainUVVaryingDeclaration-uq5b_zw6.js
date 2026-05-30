import{aa as e}from"./index-C3G0Z6z7.js";const a="meshUboDeclaration",o=`#ifdef WEBGL2
uniform mat4 world;uniform float visibility;
#else
layout(std140,column_major) uniform;uniform Mesh
{mat4 world;float visibility;};
#endif
#define WORLD_UBO
`;e.IncludesShadersStore[a]||(e.IncludesShadersStore[a]=o);const i="mainUVVaryingDeclaration",r=`#ifdef MAINUV{X}
varying vec2 vMainUV{X};
#endif
`;e.IncludesShadersStore[i]||(e.IncludesShadersStore[i]=r);
//# sourceMappingURL=mainUVVaryingDeclaration-uq5b_zw6.js.map
