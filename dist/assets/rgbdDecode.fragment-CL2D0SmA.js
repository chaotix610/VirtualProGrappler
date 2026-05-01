import{a6 as r}from"./index-BSc5uCLs.js";import"./helperFunctions-CECsfAR2.js";const e="rgbdDecodePixelShader",o=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=vec4(fromRGBD(texture2D(textureSampler,vUV)),1.0);}`;r.ShadersStore[e]||(r.ShadersStore[e]=o);const d={name:e,shader:o};export{d as rgbdDecodePixelShader};
//# sourceMappingURL=rgbdDecode.fragment-CL2D0SmA.js.map
