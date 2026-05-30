import{aa as e}from"./index-C3G0Z6z7.js";const d="vertexColorMixing",o=`#if defined(VERTEXCOLOR) || defined(INSTANCESCOLOR) && defined(INSTANCES)
vColor=vec4(1.0);
#ifdef VERTEXCOLOR
#ifdef VERTEXALPHA
vColor*=colorUpdated;
#else
vColor.rgb*=colorUpdated.rgb;
#endif
#endif
#ifdef INSTANCESCOLOR
vColor*=instanceColor;
#endif
#endif
`;e.IncludesShadersStore[d]||(e.IncludesShadersStore[d]=o);
//# sourceMappingURL=vertexColorMixing-XDQPmpLO.js.map
