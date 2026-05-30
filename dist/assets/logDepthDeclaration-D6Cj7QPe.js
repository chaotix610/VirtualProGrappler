import{aa as e}from"./index-C3G0Z6z7.js";const o="sceneUboDeclaration",a=`layout(std140,column_major) uniform;uniform Scene {mat4 viewProjection;
#ifdef MULTIVIEW
mat4 viewProjectionR;
#endif 
mat4 view;mat4 projection;vec4 vEyePosition;};
`;e.IncludesShadersStore[o]||(e.IncludesShadersStore[o]=a);const t="logDepthDeclaration",n=`#ifdef LOGARITHMICDEPTH
uniform float logarithmicDepthConstant;varying float vFragmentDepth;
#endif
`;e.IncludesShadersStore[t]||(e.IncludesShadersStore[t]=n);
//# sourceMappingURL=logDepthDeclaration-D6Cj7QPe.js.map
