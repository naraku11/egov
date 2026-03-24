import{c as g,t as o,q as x,r as T,s as _,v,w as m,x as I}from"./index-Bxk6p0iT.js";/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=[["path",{d:"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",key:"169zse"}]],$=g("activity",S);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X=[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]],j=g("refresh-cw",X);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"M16 7h6v6",key:"box55l"}],["path",{d:"m22 7-8.5 8.5-5-5L2 17",key:"1t1m79"}]],C=g("trending-up",N);/**
 * @license lucide-react v0.577.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const w=[["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["path",{d:"M16 3.128a4 4 0 0 1 0 7.744",key:"16gr8j"}],["path",{d:"M22 21v-2a4 4 0 0 0-3-3.87",key:"kshegd"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],p=g("users",w);function D(t,n){const e=o(t),a=o(n),s=e.getTime()-a.getTime();return s<0?-1:s>0?1:s}function L(t){return x(t,Date.now())}function O(t,n){const e=o(t),a=o(n),s=e.getFullYear()-a.getFullYear(),i=e.getMonth()-a.getMonth();return s*12+i}function R(t){return n=>{const a=(t?Math[t]:Math.trunc)(n);return a===0?0:a}}function Y(t,n){return+o(t)-+o(n)}function H(t){const n=o(t);return n.setHours(23,59,59,999),n}function b(t){const n=o(t),e=n.getMonth();return n.setFullYear(n.getFullYear(),e+1,0),n.setHours(23,59,59,999),n}function A(t){const n=o(t);return+H(n)==+b(n)}function F(t,n){const e=o(t),a=o(n),s=D(e,a),i=Math.abs(O(e,a));let f;if(i<1)f=0;else{e.getMonth()===1&&e.getDate()>27&&e.setDate(30),e.setMonth(e.getMonth()-s*i);let r=D(e,a)===-s;A(o(t))&&i===1&&D(t,a)===1&&(r=!1),f=s*(i-Number(r))}return f===0?0:f}function U(t,n,e){const a=Y(t,n)/1e3;return R(e==null?void 0:e.roundingMethod)(a)}function q(t,n,e){const a=I(),s=(e==null?void 0:e.locale)??a.locale??T,i=2520,f=D(t,n);if(isNaN(f))throw new RangeError("Invalid time value");const r=Object.assign({},e,{addSuffix:e==null?void 0:e.addSuffix,comparison:f});let h,M;f>0?(h=o(n),M=o(t)):(h=o(t),M=o(n));const l=U(M,h),k=(_(M)-_(h))/1e3,c=Math.round((l-k)/60);let d;if(c<2)return e!=null&&e.includeSeconds?l<5?s.formatDistance("lessThanXSeconds",5,r):l<10?s.formatDistance("lessThanXSeconds",10,r):l<20?s.formatDistance("lessThanXSeconds",20,r):l<40?s.formatDistance("halfAMinute",0,r):l<60?s.formatDistance("lessThanXMinutes",1,r):s.formatDistance("xMinutes",1,r):c===0?s.formatDistance("lessThanXMinutes",1,r):s.formatDistance("xMinutes",c,r);if(c<45)return s.formatDistance("xMinutes",c,r);if(c<90)return s.formatDistance("aboutXHours",1,r);if(c<v){const u=Math.round(c/60);return s.formatDistance("aboutXHours",u,r)}else{if(c<i)return s.formatDistance("xDays",1,r);if(c<m){const u=Math.round(c/v);return s.formatDistance("xDays",u,r)}else if(c<m*2)return d=Math.round(c/m),s.formatDistance("aboutXMonths",d,r)}if(d=F(M,h),d<12){const u=Math.round(c/m);return s.formatDistance("xMonths",u,r)}else{const u=d%12,y=Math.trunc(d/12);return u<3?s.formatDistance("aboutXYears",y,r):u<9?s.formatDistance("overXYears",y,r):s.formatDistance("almostXYears",y+1,r)}}function E(t,n){return q(t,L(t),n)}export{$ as A,j as R,C as T,p as U,E as f};
