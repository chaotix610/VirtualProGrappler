import{a6 as r}from"./index-C6WtG_Ky.js";import"./helperFunctions-CwUmwdl9.js";const e="rgbdEncodePixelShader",o=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=toRGBD(texture2D(textureSampler,vUV).rgb);}`;r.ShadersStore[e]||(r.ShadersStore[e]=o);const d={name:e,shader:o};export{d as rgbdEncodePixelShader};
//# sourceMappingURL=rgbdEncode.fragment-DPkdDvR7.js.map
