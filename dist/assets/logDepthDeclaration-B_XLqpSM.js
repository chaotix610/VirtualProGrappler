import{a6 as e}from"./index-BSc5uCLs.js";const o="sceneUboDeclaration",n=`layout(std140,column_major) uniform;uniform Scene {mat4 viewProjection;
#ifdef MULTIVIEW
mat4 viewProjectionR;
#endif 
mat4 view;mat4 projection;vec4 vEyePosition;};
`;e.IncludesShadersStore[o]||(e.IncludesShadersStore[o]=n);const t="logDepthDeclaration",a=`#ifdef LOGARITHMICDEPTH
uniform float logarithmicDepthConstant;varying float vFragmentDepth;
#endif
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=a);
//# sourceMappingURL=logDepthDeclaration-B_XLqpSM.js.map
