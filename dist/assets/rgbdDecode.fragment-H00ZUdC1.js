import{aa as r}from"./index-C3G0Z6z7.js";import"./helperFunctions-BQvbC7Ln.js";const e="rgbdDecodePixelShader",o=`varying vec2 vUV;uniform sampler2D textureSampler;
#include<helperFunctions>
#define CUSTOM_FRAGMENT_DEFINITIONS
void main(void) 
{gl_FragColor=vec4(fromRGBD(texture2D(textureSampler,vUV)),1.0);}`;r.ShadersStore[e]||(r.ShadersStore[e]=o);const d={name:e,shader:o};export{d as rgbdDecodePixelShader};
//# sourceMappingURL=rgbdDecode.fragment-H00ZUdC1.js.map
