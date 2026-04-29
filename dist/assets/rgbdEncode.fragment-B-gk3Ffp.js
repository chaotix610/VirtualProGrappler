import{a6 as r}from"./index-rrkVmw34.js";import"./helperFunctions-Dg3k0_3n.js";const e="rgbdEncodePixelShader",o=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=toRGBD(texture2D(textureSampler,vUV).rgb);}`;r.ShadersStore[e]||(r.ShadersStore[e]=o);const d={name:e,shader:o};export{d as rgbdEncodePixelShader};
//# sourceMappingURL=rgbdEncode.fragment-B-gk3Ffp.js.map
