import { P as PropertyType, M as MathUtils, D as Document, F as FileUtils, I as ImageUtils, C as ComponentTypeToTypedArray, h as Primitive, g as getBounds$1, j as Material, b as TextureChannel, S as Scene, T as TextureInfo, k as ColorUtils, i as Root, A as Accessor, e as AnimationSampler, f as AnimationChannel, u as uuid, B as BufferUtils, l as Texture, a as ExtensionProperty, N as Node, m as Mesh, n as PrimitiveTarget } from './index-Do_GHzfw.js';
import { cB as getDefaultExportFromCjs } from './index-CtIMEkHY.js';
import { K as KHRDracoMeshCompression, E as EXTMeshGPUInstancing, a as EXTMeshoptCompression, b as KHRMaterialsIOR, c as KHRMaterialsSpecular, d as KHRMaterialsPBRSpecularGlossiness, e as KHRMeshQuantization, f as EXTTextureWebP, g as EXTTextureAVIF, h as KHRMaterialsUnlit, r as read, i as KHR_DF_MODEL_ETC1S, j as KHR_DF_MODEL_UASTC, k as KHRMeshPrimitiveRestart } from './index-CKuQAJHO.js';
import './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import './trace-api-BIfvUk_c.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';
import './decode-CN54oYFr.js';
import './preload-helper-CJHylW7d.js';

var iota_1;
var hasRequiredIota;

function requireIota () {
	if (hasRequiredIota) return iota_1;
	hasRequiredIota = 1;

	function iota(n) {
	  var result = new Array(n);
	  for(var i=0; i<n; ++i) {
	    result[i] = i;
	  }
	  return result
	}

	iota_1 = iota;
	return iota_1;
}

/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

var isBuffer_1;
var hasRequiredIsBuffer;

function requireIsBuffer () {
	if (hasRequiredIsBuffer) return isBuffer_1;
	hasRequiredIsBuffer = 1;
	// The _isBuffer check is for Safari 5-7 support, because it's missing
	// Object.prototype.constructor. Remove this eventually
	isBuffer_1 = function (obj) {
	  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
	};

	function isBuffer (obj) {
	  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
	}

	// For Node v0.10 support. Remove this eventually.
	function isSlowBuffer (obj) {
	  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
	}
	return isBuffer_1;
}

var ndarray$1;
var hasRequiredNdarray;

function requireNdarray () {
	if (hasRequiredNdarray) return ndarray$1;
	hasRequiredNdarray = 1;
	var iota = requireIota();
	var isBuffer = requireIsBuffer();

	var hasTypedArrays  = ((typeof Float64Array) !== "undefined");

	function compare1st(a, b) {
	  return a[0] - b[0]
	}

	function order() {
	  var stride = this.stride;
	  var terms = new Array(stride.length);
	  var i;
	  for(i=0; i<terms.length; ++i) {
	    terms[i] = [Math.abs(stride[i]), i];
	  }
	  terms.sort(compare1st);
	  var result = new Array(terms.length);
	  for(i=0; i<result.length; ++i) {
	    result[i] = terms[i][1];
	  }
	  return result
	}

	function compileConstructor(dtype, dimension) {
	  var className = ["View", dimension, "d", dtype].join("");
	  if(dimension < 0) {
	    className = "View_Nil" + dtype;
	  }
	  var useGetters = (dtype === "generic");

	  if(dimension === -1) {
	    //Special case for trivial arrays
	    var code =
	      "function "+className+"(a){this.data=a;};\
	var proto="+className+".prototype;\
	proto.dtype='"+dtype+"';\
	proto.index=function(){return -1};\
	proto.size=0;\
	proto.dimension=-1;\
	proto.shape=proto.stride=proto.order=[];\
	proto.lo=proto.hi=proto.transpose=proto.step=\
	function(){return new "+className+"(this.data);};\
	proto.get=proto.set=function(){};\
	proto.pick=function(){return null};\
	return function construct_"+className+"(a){return new "+className+"(a);}";
	    var procedure = new Function(code);
	    return procedure()
	  } else if(dimension === 0) {
	    //Special case for 0d arrays
	    var code =
	      "function "+className+"(a,d) {\
	this.data = a;\
	this.offset = d\
	};\
	var proto="+className+".prototype;\
	proto.dtype='"+dtype+"';\
	proto.index=function(){return this.offset};\
	proto.dimension=0;\
	proto.size=1;\
	proto.shape=\
	proto.stride=\
	proto.order=[];\
	proto.lo=\
	proto.hi=\
	proto.transpose=\
	proto.step=function "+className+"_copy() {\
	return new "+className+"(this.data,this.offset)\
	};\
	proto.pick=function "+className+"_pick(){\
	return TrivialArray(this.data);\
	};\
	proto.valueOf=proto.get=function "+className+"_get(){\
	return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
	"};\
	proto.set=function "+className+"_set(v){\
	return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
	};\
	return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}";
	    var procedure = new Function("TrivialArray", code);
	    return procedure(CACHED_CONSTRUCTORS[dtype][0])
	  }

	  var code = ["'use strict'"];

	  //Create constructor for view
	  var indices = iota(dimension);
	  var args = indices.map(function(i) { return "i"+i });
	  var index_str = "this.offset+" + indices.map(function(i) {
	        return "this.stride[" + i + "]*i" + i
	      }).join("+");
	  var shapeArg = indices.map(function(i) {
	      return "b"+i
	    }).join(",");
	  var strideArg = indices.map(function(i) {
	      return "c"+i
	    }).join(",");
	  code.push(
	    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
	      "this.shape=[" + shapeArg + "]",
	      "this.stride=[" + strideArg + "]",
	      "this.offset=d|0}",
	    "var proto="+className+".prototype",
	    "proto.dtype='"+dtype+"'",
	    "proto.dimension="+dimension);

	  //view.size:
	  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
	return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
	"}})");

	  //view.order:
	  if(dimension === 1) {
	    code.push("proto.order=[0]");
	  } else {
	    code.push("Object.defineProperty(proto,'order',{get:");
	    if(dimension < 4) {
	      code.push("function "+className+"_order(){");
	      if(dimension === 2) {
	        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})");
	      } else if(dimension === 3) {
	        code.push(
	"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
	if(s0>s1){\
	if(s1>s2){\
	return [2,1,0];\
	}else if(s0>s2){\
	return [1,2,0];\
	}else{\
	return [1,0,2];\
	}\
	}else if(s0>s2){\
	return [2,0,1];\
	}else if(s2>s1){\
	return [0,1,2];\
	}else{\
	return [0,2,1];\
	}}})");
	      }
	    } else {
	      code.push("ORDER})");
	    }
	  }

	  //view.set(i0, ..., v):
	  code.push(
	"proto.set=function "+className+"_set("+args.join(",")+",v){");
	  if(useGetters) {
	    code.push("return this.data.set("+index_str+",v)}");
	  } else {
	    code.push("return this.data["+index_str+"]=v}");
	  }

	  //view.get(i0, ...):
	  code.push("proto.get=function "+className+"_get("+args.join(",")+"){");
	  if(useGetters) {
	    code.push("return this.data.get("+index_str+")}");
	  } else {
	    code.push("return this.data["+index_str+"]}");
	  }

	  //view.index:
	  code.push(
	    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}");

	  //view.hi():
	  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
	    indices.map(function(i) {
	      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
	    }).join(",")+","+
	    indices.map(function(i) {
	      return "this.stride["+i + "]"
	    }).join(",")+",this.offset)}");

	  //view.lo():
	  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" });
	  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" });
	  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","));
	  for(var i=0; i<dimension; ++i) {
	    code.push(
	"if(typeof i"+i+"==='number'&&i"+i+">=0){\
	d=i"+i+"|0;\
	b+=c"+i+"*d;\
	a"+i+"-=d}");
	  }
	  code.push("return new "+className+"(this.data,"+
	    indices.map(function(i) {
	      return "a"+i
	    }).join(",")+","+
	    indices.map(function(i) {
	      return "c"+i
	    }).join(",")+",b)}");

	  //view.step():
	  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
	    indices.map(function(i) {
	      return "a"+i+"=this.shape["+i+"]"
	    }).join(",")+","+
	    indices.map(function(i) {
	      return "b"+i+"=this.stride["+i+"]"
	    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil");
	  for(var i=0; i<dimension; ++i) {
	    code.push(
	"if(typeof i"+i+"==='number'){\
	d=i"+i+"|0;\
	if(d<0){\
	c+=b"+i+"*(a"+i+"-1);\
	a"+i+"=ceil(-a"+i+"/d)\
	}else{\
	a"+i+"=ceil(a"+i+"/d)\
	}\
	b"+i+"*=d\
	}");
	  }
	  code.push("return new "+className+"(this.data,"+
	    indices.map(function(i) {
	      return "a" + i
	    }).join(",")+","+
	    indices.map(function(i) {
	      return "b" + i
	    }).join(",")+",c)}");

	  //view.transpose():
	  var tShape = new Array(dimension);
	  var tStride = new Array(dimension);
	  for(var i=0; i<dimension; ++i) {
	    tShape[i] = "a[i"+i+"]";
	    tStride[i] = "b[i"+i+"]";
	  }
	  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
	    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
	    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}");

	  //view.pick():
	  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset");
	  for(var i=0; i<dimension; ++i) {
	    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}");
	  }
	  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}");

	  //Add return statement
	  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
	    indices.map(function(i) {
	      return "shape["+i+"]"
	    }).join(",")+","+
	    indices.map(function(i) {
	      return "stride["+i+"]"
	    }).join(",")+",offset)}");

	  //Compile procedure
	  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"));
	  return procedure(CACHED_CONSTRUCTORS[dtype], order)
	}

	function arrayDType(data) {
	  if(isBuffer(data)) {
	    return "buffer"
	  }
	  if(hasTypedArrays) {
	    switch(Object.prototype.toString.call(data)) {
	      case "[object Float64Array]":
	        return "float64"
	      case "[object Float32Array]":
	        return "float32"
	      case "[object Int8Array]":
	        return "int8"
	      case "[object Int16Array]":
	        return "int16"
	      case "[object Int32Array]":
	        return "int32"
	      case "[object Uint8Array]":
	        return "uint8"
	      case "[object Uint16Array]":
	        return "uint16"
	      case "[object Uint32Array]":
	        return "uint32"
	      case "[object Uint8ClampedArray]":
	        return "uint8_clamped"
	      case "[object BigInt64Array]":
	        return "bigint64"
	      case "[object BigUint64Array]":
	        return "biguint64"
	    }
	  }
	  if(Array.isArray(data)) {
	    return "array"
	  }
	  return "generic"
	}

	var CACHED_CONSTRUCTORS = {
	  "float32":[],
	  "float64":[],
	  "int8":[],
	  "int16":[],
	  "int32":[],
	  "uint8":[],
	  "uint16":[],
	  "uint32":[],
	  "array":[],
	  "uint8_clamped":[],
	  "bigint64": [],
	  "biguint64": [],
	  "buffer":[],
	  "generic":[]
	}

	;
	function wrappedNDArrayCtor(data, shape, stride, offset) {
	  if(data === undefined) {
	    var ctor = CACHED_CONSTRUCTORS.array[0];
	    return ctor([])
	  } else if(typeof data === "number") {
	    data = [data];
	  }
	  if(shape === undefined) {
	    shape = [ data.length ];
	  }
	  var d = shape.length;
	  if(stride === undefined) {
	    stride = new Array(d);
	    for(var i=d-1, sz=1; i>=0; --i) {
	      stride[i] = sz;
	      sz *= shape[i];
	    }
	  }
	  if(offset === undefined) {
	    offset = 0;
	    for(var i=0; i<d; ++i) {
	      if(stride[i] < 0) {
	        offset -= (shape[i]-1)*stride[i];
	      }
	    }
	  }
	  var dtype = arrayDType(data);
	  var ctor_list = CACHED_CONSTRUCTORS[dtype];
	  while(ctor_list.length <= d+1) {
	    ctor_list.push(compileConstructor(dtype, ctor_list.length-1));
	  }
	  var ctor = ctor_list[d+1];
	  return ctor(data, shape, stride, offset)
	}

	ndarray$1 = wrappedNDArrayCtor;
	return ndarray$1;
}

var ndarrayExports = requireNdarray();
const ndarray = /*@__PURE__*/getDefaultExportFromCjs(ndarrayExports);

var ndarrayOps = {};

var uniq;
var hasRequiredUniq;

function requireUniq () {
	if (hasRequiredUniq) return uniq;
	hasRequiredUniq = 1;

	function unique_pred(list, compare) {
	  var ptr = 1
	    , len = list.length
	    , a=list[0], b=list[0];
	  for(var i=1; i<len; ++i) {
	    b = a;
	    a = list[i];
	    if(compare(a, b)) {
	      if(i === ptr) {
	        ptr++;
	        continue
	      }
	      list[ptr++] = a;
	    }
	  }
	  list.length = ptr;
	  return list
	}

	function unique_eq(list) {
	  var ptr = 1
	    , len = list.length
	    , a=list[0], b = list[0];
	  for(var i=1; i<len; ++i, b=a) {
	    b = a;
	    a = list[i];
	    if(a !== b) {
	      if(i === ptr) {
	        ptr++;
	        continue
	      }
	      list[ptr++] = a;
	    }
	  }
	  list.length = ptr;
	  return list
	}

	function unique(list, compare, sorted) {
	  if(list.length === 0) {
	    return list
	  }
	  if(compare) {
	    if(!sorted) {
	      list.sort(compare);
	    }
	    return unique_pred(list, compare)
	  }
	  if(!sorted) {
	    list.sort();
	  }
	  return unique_eq(list)
	}

	uniq = unique;
	return uniq;
}

var compile;
var hasRequiredCompile;

function requireCompile () {
	if (hasRequiredCompile) return compile;
	hasRequiredCompile = 1;

	var uniq = requireUniq();

	// This function generates very simple loops analogous to how you typically traverse arrays (the outermost loop corresponds to the slowest changing index, the innermost loop to the fastest changing index)
	// TODO: If two arrays have the same strides (and offsets) there is potential for decreasing the number of "pointers" and related variables. The drawback is that the type signature would become more specific and that there would thus be less potential for caching, but it might still be worth it, especially when dealing with large numbers of arguments.
	function innerFill(order, proc, body) {
	  var dimension = order.length
	    , nargs = proc.arrayArgs.length
	    , has_index = proc.indexArgs.length>0
	    , code = []
	    , vars = []
	    , idx=0, pidx=0, i, j;
	  for(i=0; i<dimension; ++i) { // Iteration variables
	    vars.push(["i",i,"=0"].join(""));
	  }
	  //Compute scan deltas
	  for(j=0; j<nargs; ++j) {
	    for(i=0; i<dimension; ++i) {
	      pidx = idx;
	      idx = order[i];
	      if(i === 0) { // The innermost/fastest dimension's delta is simply its stride
	        vars.push(["d",j,"s",i,"=t",j,"p",idx].join(""));
	      } else { // For other dimensions the delta is basically the stride minus something which essentially "rewinds" the previous (more inner) dimension
	        vars.push(["d",j,"s",i,"=(t",j,"p",idx,"-s",pidx,"*t",j,"p",pidx,")"].join(""));
	      }
	    }
	  }
	  if (vars.length > 0) {
	    code.push("var " + vars.join(","));
	  }  
	  //Scan loop
	  for(i=dimension-1; i>=0; --i) { // Start at largest stride and work your way inwards
	    idx = order[i];
	    code.push(["for(i",i,"=0;i",i,"<s",idx,";++i",i,"){"].join(""));
	  }
	  //Push body of inner loop
	  code.push(body);
	  //Advance scan pointers
	  for(i=0; i<dimension; ++i) {
	    pidx = idx;
	    idx = order[i];
	    for(j=0; j<nargs; ++j) {
	      code.push(["p",j,"+=d",j,"s",i].join(""));
	    }
	    if(has_index) {
	      if(i > 0) {
	        code.push(["index[",pidx,"]-=s",pidx].join(""));
	      }
	      code.push(["++index[",idx,"]"].join(""));
	    }
	    code.push("}");
	  }
	  return code.join("\n")
	}

	// Generate "outer" loops that loop over blocks of data, applying "inner" loops to the blocks by manipulating the local variables in such a way that the inner loop only "sees" the current block.
	// TODO: If this is used, then the previous declaration (done by generateCwiseOp) of s* is essentially unnecessary.
	//       I believe the s* are not used elsewhere (in particular, I don't think they're used in the pre/post parts and "shape" is defined independently), so it would be possible to make defining the s* dependent on what loop method is being used.
	function outerFill(matched, order, proc, body) {
	  var dimension = order.length
	    , nargs = proc.arrayArgs.length
	    , blockSize = proc.blockSize
	    , has_index = proc.indexArgs.length > 0
	    , code = [];
	  for(var i=0; i<nargs; ++i) {
	    code.push(["var offset",i,"=p",i].join(""));
	  }
	  //Generate loops for unmatched dimensions
	  // The order in which these dimensions are traversed is fairly arbitrary (from small stride to large stride, for the first argument)
	  // TODO: It would be nice if the order in which these loops are placed would also be somehow "optimal" (at the very least we should check that it really doesn't hurt us if they're not).
	  for(var i=matched; i<dimension; ++i) {
	    code.push(["for(var j"+i+"=SS[", order[i], "]|0;j", i, ">0;){"].join("")); // Iterate back to front
	    code.push(["if(j",i,"<",blockSize,"){"].join("")); // Either decrease j by blockSize (s = blockSize), or set it to zero (after setting s = j).
	    code.push(["s",order[i],"=j",i].join(""));
	    code.push(["j",i,"=0"].join(""));
	    code.push(["}else{s",order[i],"=",blockSize].join(""));
	    code.push(["j",i,"-=",blockSize,"}"].join(""));
	    if(has_index) {
	      code.push(["index[",order[i],"]=j",i].join(""));
	    }
	  }
	  for(var i=0; i<nargs; ++i) {
	    var indexStr = ["offset"+i];
	    for(var j=matched; j<dimension; ++j) {
	      indexStr.push(["j",j,"*t",i,"p",order[j]].join(""));
	    }
	    code.push(["p",i,"=(",indexStr.join("+"),")"].join(""));
	  }
	  code.push(innerFill(order, proc, body));
	  for(var i=matched; i<dimension; ++i) {
	    code.push("}");
	  }
	  return code.join("\n")
	}

	//Count the number of compatible inner orders
	// This is the length of the longest common prefix of the arrays in orders.
	// Each array in orders lists the dimensions of the correspond ndarray in order of increasing stride.
	// This is thus the maximum number of dimensions that can be efficiently traversed by simple nested loops for all arrays.
	function countMatches(orders) {
	  var matched = 0, dimension = orders[0].length;
	  while(matched < dimension) {
	    for(var j=1; j<orders.length; ++j) {
	      if(orders[j][matched] !== orders[0][matched]) {
	        return matched
	      }
	    }
	    ++matched;
	  }
	  return matched
	}

	//Processes a block according to the given data types
	// Replaces variable names by different ones, either "local" ones (that are then ferried in and out of the given array) or ones matching the arguments that the function performing the ultimate loop will accept.
	function processBlock(block, proc, dtypes) {
	  var code = block.body;
	  var pre = [];
	  var post = [];
	  for(var i=0; i<block.args.length; ++i) {
	    var carg = block.args[i];
	    if(carg.count <= 0) {
	      continue
	    }
	    var re = new RegExp(carg.name, "g");
	    var ptrStr = "";
	    var arrNum = proc.arrayArgs.indexOf(i);
	    switch(proc.argTypes[i]) {
	      case "offset":
	        var offArgIndex = proc.offsetArgIndex.indexOf(i);
	        var offArg = proc.offsetArgs[offArgIndex];
	        arrNum = offArg.array;
	        ptrStr = "+q" + offArgIndex; // Adds offset to the "pointer" in the array
	      case "array":
	        ptrStr = "p" + arrNum + ptrStr;
	        var localStr = "l" + i;
	        var arrStr = "a" + arrNum;
	        if (proc.arrayBlockIndices[arrNum] === 0) { // Argument to body is just a single value from this array
	          if(carg.count === 1) { // Argument/array used only once(?)
	            if(dtypes[arrNum] === "generic") {
	              if(carg.lvalue) {
	                pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")); // Is this necessary if the argument is ONLY used as an lvalue? (keep in mind that we can have a += something, so we would actually need to check carg.rvalue)
	                code = code.replace(re, localStr);
	                post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""));
	              } else {
	                code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""));
	              }
	            } else {
	              code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""));
	            }
	          } else if(dtypes[arrNum] === "generic") {
	            pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")); // TODO: Could we optimize by checking for carg.rvalue?
	            code = code.replace(re, localStr);
	            if(carg.lvalue) {
	              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""));
	            }
	          } else {
	            pre.push(["var ", localStr, "=", arrStr, "[", ptrStr, "]"].join("")); // TODO: Could we optimize by checking for carg.rvalue?
	            code = code.replace(re, localStr);
	            if(carg.lvalue) {
	              post.push([arrStr, "[", ptrStr, "]=", localStr].join(""));
	            }
	          }
	        } else { // Argument to body is a "block"
	          var reStrArr = [carg.name], ptrStrArr = [ptrStr];
	          for(var j=0; j<Math.abs(proc.arrayBlockIndices[arrNum]); j++) {
	            reStrArr.push("\\s*\\[([^\\]]+)\\]");
	            ptrStrArr.push("$" + (j+1) + "*t" + arrNum + "b" + j); // Matched index times stride
	          }
	          re = new RegExp(reStrArr.join(""), "g");
	          ptrStr = ptrStrArr.join("+");
	          if(dtypes[arrNum] === "generic") {
	            /*if(carg.lvalue) {
	              pre.push(["var ", localStr, "=", arrStr, ".get(", ptrStr, ")"].join("")) // Is this necessary if the argument is ONLY used as an lvalue? (keep in mind that we can have a += something, so we would actually need to check carg.rvalue)
	              code = code.replace(re, localStr)
	              post.push([arrStr, ".set(", ptrStr, ",", localStr,")"].join(""))
	            } else {
	              code = code.replace(re, [arrStr, ".get(", ptrStr, ")"].join(""))
	            }*/
	            throw new Error("cwise: Generic arrays not supported in combination with blocks!")
	          } else {
	            // This does not produce any local variables, even if variables are used multiple times. It would be possible to do so, but it would complicate things quite a bit.
	            code = code.replace(re, [arrStr, "[", ptrStr, "]"].join(""));
	          }
	        }
	      break
	      case "scalar":
	        code = code.replace(re, "Y" + proc.scalarArgs.indexOf(i));
	      break
	      case "index":
	        code = code.replace(re, "index");
	      break
	      case "shape":
	        code = code.replace(re, "shape");
	      break
	    }
	  }
	  return [pre.join("\n"), code, post.join("\n")].join("\n").trim()
	}

	function typeSummary(dtypes) {
	  var summary = new Array(dtypes.length);
	  var allEqual = true;
	  for(var i=0; i<dtypes.length; ++i) {
	    var t = dtypes[i];
	    var digits = t.match(/\d+/);
	    if(!digits) {
	      digits = "";
	    } else {
	      digits = digits[0];
	    }
	    if(t.charAt(0) === 0) {
	      summary[i] = "u" + t.charAt(1) + digits;
	    } else {
	      summary[i] = t.charAt(0) + digits;
	    }
	    if(i > 0) {
	      allEqual = allEqual && summary[i] === summary[i-1];
	    }
	  }
	  if(allEqual) {
	    return summary[0]
	  }
	  return summary.join("")
	}

	//Generates a cwise operator
	function generateCWiseOp(proc, typesig) {

	  //Compute dimension
	  // Arrays get put first in typesig, and there are two entries per array (dtype and order), so this gets the number of dimensions in the first array arg.
	  var dimension = (typesig[1].length - Math.abs(proc.arrayBlockIndices[0]))|0;
	  var orders = new Array(proc.arrayArgs.length);
	  var dtypes = new Array(proc.arrayArgs.length);
	  for(var i=0; i<proc.arrayArgs.length; ++i) {
	    dtypes[i] = typesig[2*i];
	    orders[i] = typesig[2*i+1];
	  }
	  
	  //Determine where block and loop indices start and end
	  var blockBegin = [], blockEnd = []; // These indices are exposed as blocks
	  var loopBegin = [], loopEnd = []; // These indices are iterated over
	  var loopOrders = []; // orders restricted to the loop indices
	  for(var i=0; i<proc.arrayArgs.length; ++i) {
	    if (proc.arrayBlockIndices[i]<0) {
	      loopBegin.push(0);
	      loopEnd.push(dimension);
	      blockBegin.push(dimension);
	      blockEnd.push(dimension+proc.arrayBlockIndices[i]);
	    } else {
	      loopBegin.push(proc.arrayBlockIndices[i]); // Non-negative
	      loopEnd.push(proc.arrayBlockIndices[i]+dimension);
	      blockBegin.push(0);
	      blockEnd.push(proc.arrayBlockIndices[i]);
	    }
	    var newOrder = [];
	    for(var j=0; j<orders[i].length; j++) {
	      if (loopBegin[i]<=orders[i][j] && orders[i][j]<loopEnd[i]) {
	        newOrder.push(orders[i][j]-loopBegin[i]); // If this is a loop index, put it in newOrder, subtracting loopBegin, to make sure that all loopOrders are using a common set of indices.
	      }
	    }
	    loopOrders.push(newOrder);
	  }

	  //First create arguments for procedure
	  var arglist = ["SS"]; // SS is the overall shape over which we iterate
	  var code = ["'use strict'"];
	  var vars = [];
	  
	  for(var j=0; j<dimension; ++j) {
	    vars.push(["s", j, "=SS[", j, "]"].join("")); // The limits for each dimension.
	  }
	  for(var i=0; i<proc.arrayArgs.length; ++i) {
	    arglist.push("a"+i); // Actual data array
	    arglist.push("t"+i); // Strides
	    arglist.push("p"+i); // Offset in the array at which the data starts (also used for iterating over the data)
	    
	    for(var j=0; j<dimension; ++j) { // Unpack the strides into vars for looping
	      vars.push(["t",i,"p",j,"=t",i,"[",loopBegin[i]+j,"]"].join(""));
	    }
	    
	    for(var j=0; j<Math.abs(proc.arrayBlockIndices[i]); ++j) { // Unpack the strides into vars for block iteration
	      vars.push(["t",i,"b",j,"=t",i,"[",blockBegin[i]+j,"]"].join(""));
	    }
	  }
	  for(var i=0; i<proc.scalarArgs.length; ++i) {
	    arglist.push("Y" + i);
	  }
	  if(proc.shapeArgs.length > 0) {
	    vars.push("shape=SS.slice(0)"); // Makes the shape over which we iterate available to the user defined functions (so you can use width/height for example)
	  }
	  if(proc.indexArgs.length > 0) {
	    // Prepare an array to keep track of the (logical) indices, initialized to dimension zeroes.
	    var zeros = new Array(dimension);
	    for(var i=0; i<dimension; ++i) {
	      zeros[i] = "0";
	    }
	    vars.push(["index=[", zeros.join(","), "]"].join(""));
	  }
	  for(var i=0; i<proc.offsetArgs.length; ++i) { // Offset arguments used for stencil operations
	    var off_arg = proc.offsetArgs[i];
	    var init_string = [];
	    for(var j=0; j<off_arg.offset.length; ++j) {
	      if(off_arg.offset[j] === 0) {
	        continue
	      } else if(off_arg.offset[j] === 1) {
	        init_string.push(["t", off_arg.array, "p", j].join(""));      
	      } else {
	        init_string.push([off_arg.offset[j], "*t", off_arg.array, "p", j].join(""));
	      }
	    }
	    if(init_string.length === 0) {
	      vars.push("q" + i + "=0");
	    } else {
	      vars.push(["q", i, "=", init_string.join("+")].join(""));
	    }
	  }

	  //Prepare this variables
	  var thisVars = uniq([].concat(proc.pre.thisVars)
	                      .concat(proc.body.thisVars)
	                      .concat(proc.post.thisVars));
	  vars = vars.concat(thisVars);
	  if (vars.length > 0) {
	    code.push("var " + vars.join(","));
	  }
	  for(var i=0; i<proc.arrayArgs.length; ++i) {
	    code.push("p"+i+"|=0");
	  }
	  
	  //Inline prelude
	  if(proc.pre.body.length > 3) {
	    code.push(processBlock(proc.pre, proc, dtypes));
	  }

	  //Process body
	  var body = processBlock(proc.body, proc, dtypes);
	  var matched = countMatches(loopOrders);
	  if(matched < dimension) {
	    code.push(outerFill(matched, loopOrders[0], proc, body)); // TODO: Rather than passing loopOrders[0], it might be interesting to look at passing an order that represents the majority of the arguments for example.
	  } else {
	    code.push(innerFill(loopOrders[0], proc, body));
	  }

	  //Inline epilog
	  if(proc.post.body.length > 3) {
	    code.push(processBlock(proc.post, proc, dtypes));
	  }
	  
	  if(proc.debug) {
	    console.log("-----Generated cwise routine for ", typesig, ":\n" + code.join("\n") + "\n----------");
	  }
	  
	  var loopName = [(proc.funcName||"unnamed"), "_cwise_loop_", orders[0].join("s"),"m",matched,typeSummary(dtypes)].join("");
	  var f = new Function(["function ",loopName,"(", arglist.join(","),"){", code.join("\n"),"} return ", loopName].join(""));
	  return f()
	}
	compile = generateCWiseOp;
	return compile;
}

var thunk;
var hasRequiredThunk;

function requireThunk () {
	if (hasRequiredThunk) return thunk;
	hasRequiredThunk = 1;

	// The function below is called when constructing a cwise function object, and does the following:
	// A function object is constructed which accepts as argument a compilation function and returns another function.
	// It is this other function that is eventually returned by createThunk, and this function is the one that actually
	// checks whether a certain pattern of arguments has already been used before and compiles new loops as needed.
	// The compilation passed to the first function object is used for compiling new functions.
	// Once this function object is created, it is called with compile as argument, where the first argument of compile
	// is bound to "proc" (essentially containing a preprocessed version of the user arguments to cwise).
	// So createThunk roughly works like this:
	// function createThunk(proc) {
	//   var thunk = function(compileBound) {
	//     var CACHED = {}
	//     return function(arrays and scalars) {
	//       if (dtype and order of arrays in CACHED) {
	//         var func = CACHED[dtype and order of arrays]
	//       } else {
	//         var func = CACHED[dtype and order of arrays] = compileBound(dtype and order of arrays)
	//       }
	//       return func(arrays and scalars)
	//     }
	//   }
	//   return thunk(compile.bind1(proc))
	// }

	var compile = requireCompile();

	function createThunk(proc) {
	  var code = ["'use strict'", "var CACHED={}"];
	  var vars = [];
	  var thunkName = proc.funcName + "_cwise_thunk";
	  
	  //Build thunk
	  code.push(["return function ", thunkName, "(", proc.shimArgs.join(","), "){"].join(""));
	  var typesig = [];
	  var string_typesig = [];
	  var proc_args = [["array",proc.arrayArgs[0],".shape.slice(", // Slice shape so that we only retain the shape over which we iterate (which gets passed to the cwise operator as SS).
	                    Math.max(0,proc.arrayBlockIndices[0]),proc.arrayBlockIndices[0]<0?(","+proc.arrayBlockIndices[0]+")"):")"].join("")];
	  var shapeLengthConditions = [], shapeConditions = [];
	  // Process array arguments
	  for(var i=0; i<proc.arrayArgs.length; ++i) {
	    var j = proc.arrayArgs[i];
	    vars.push(["t", j, "=array", j, ".dtype,",
	               "r", j, "=array", j, ".order"].join(""));
	    typesig.push("t" + j);
	    typesig.push("r" + j);
	    string_typesig.push("t"+j);
	    string_typesig.push("r"+j+".join()");
	    proc_args.push("array" + j + ".data");
	    proc_args.push("array" + j + ".stride");
	    proc_args.push("array" + j + ".offset|0");
	    if (i>0) { // Gather conditions to check for shape equality (ignoring block indices)
	      shapeLengthConditions.push("array" + proc.arrayArgs[0] + ".shape.length===array" + j + ".shape.length+" + (Math.abs(proc.arrayBlockIndices[0])-Math.abs(proc.arrayBlockIndices[i])));
	      shapeConditions.push("array" + proc.arrayArgs[0] + ".shape[shapeIndex+" + Math.max(0,proc.arrayBlockIndices[0]) + "]===array" + j + ".shape[shapeIndex+" + Math.max(0,proc.arrayBlockIndices[i]) + "]");
	    }
	  }
	  // Check for shape equality
	  if (proc.arrayArgs.length > 1) {
	    code.push("if (!(" + shapeLengthConditions.join(" && ") + ")) throw new Error('cwise: Arrays do not all have the same dimensionality!')");
	    code.push("for(var shapeIndex=array" + proc.arrayArgs[0] + ".shape.length-" + Math.abs(proc.arrayBlockIndices[0]) + "; shapeIndex-->0;) {");
	    code.push("if (!(" + shapeConditions.join(" && ") + ")) throw new Error('cwise: Arrays do not all have the same shape!')");
	    code.push("}");
	  }
	  // Process scalar arguments
	  for(var i=0; i<proc.scalarArgs.length; ++i) {
	    proc_args.push("scalar" + proc.scalarArgs[i]);
	  }
	  // Check for cached function (and if not present, generate it)
	  vars.push(["type=[", string_typesig.join(","), "].join()"].join(""));
	  vars.push("proc=CACHED[type]");
	  code.push("var " + vars.join(","));
	  
	  code.push(["if(!proc){",
	             "CACHED[type]=proc=compile([", typesig.join(","), "])}",
	             "return proc(", proc_args.join(","), ")}"].join(""));

	  if(proc.debug) {
	    console.log("-----Generated thunk:\n" + code.join("\n") + "\n----------");
	  }
	  
	  //Compile thunk
	  var thunk = new Function("compile", code.join("\n"));
	  return thunk(compile.bind(undefined, proc))
	}

	thunk = createThunk;
	return thunk;
}

var compiler;
var hasRequiredCompiler;

function requireCompiler () {
	if (hasRequiredCompiler) return compiler;
	hasRequiredCompiler = 1;

	var createThunk = requireThunk();

	function Procedure() {
	  this.argTypes = [];
	  this.shimArgs = [];
	  this.arrayArgs = [];
	  this.arrayBlockIndices = [];
	  this.scalarArgs = [];
	  this.offsetArgs = [];
	  this.offsetArgIndex = [];
	  this.indexArgs = [];
	  this.shapeArgs = [];
	  this.funcName = "";
	  this.pre = null;
	  this.body = null;
	  this.post = null;
	  this.debug = false;
	}

	function compileCwise(user_args) {
	  //Create procedure
	  var proc = new Procedure();
	  
	  //Parse blocks
	  proc.pre    = user_args.pre;
	  proc.body   = user_args.body;
	  proc.post   = user_args.post;

	  //Parse arguments
	  var proc_args = user_args.args.slice(0);
	  proc.argTypes = proc_args;
	  for(var i=0; i<proc_args.length; ++i) {
	    var arg_type = proc_args[i];
	    if(arg_type === "array" || (typeof arg_type === "object" && arg_type.blockIndices)) {
	      proc.argTypes[i] = "array";
	      proc.arrayArgs.push(i);
	      proc.arrayBlockIndices.push(arg_type.blockIndices ? arg_type.blockIndices : 0);
	      proc.shimArgs.push("array" + i);
	      if(i < proc.pre.args.length && proc.pre.args[i].count>0) {
	        throw new Error("cwise: pre() block may not reference array args")
	      }
	      if(i < proc.post.args.length && proc.post.args[i].count>0) {
	        throw new Error("cwise: post() block may not reference array args")
	      }
	    } else if(arg_type === "scalar") {
	      proc.scalarArgs.push(i);
	      proc.shimArgs.push("scalar" + i);
	    } else if(arg_type === "index") {
	      proc.indexArgs.push(i);
	      if(i < proc.pre.args.length && proc.pre.args[i].count > 0) {
	        throw new Error("cwise: pre() block may not reference array index")
	      }
	      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
	        throw new Error("cwise: body() block may not write to array index")
	      }
	      if(i < proc.post.args.length && proc.post.args[i].count > 0) {
	        throw new Error("cwise: post() block may not reference array index")
	      }
	    } else if(arg_type === "shape") {
	      proc.shapeArgs.push(i);
	      if(i < proc.pre.args.length && proc.pre.args[i].lvalue) {
	        throw new Error("cwise: pre() block may not write to array shape")
	      }
	      if(i < proc.body.args.length && proc.body.args[i].lvalue) {
	        throw new Error("cwise: body() block may not write to array shape")
	      }
	      if(i < proc.post.args.length && proc.post.args[i].lvalue) {
	        throw new Error("cwise: post() block may not write to array shape")
	      }
	    } else if(typeof arg_type === "object" && arg_type.offset) {
	      proc.argTypes[i] = "offset";
	      proc.offsetArgs.push({ array: arg_type.array, offset:arg_type.offset });
	      proc.offsetArgIndex.push(i);
	    } else {
	      throw new Error("cwise: Unknown argument type " + proc_args[i])
	    }
	  }
	  
	  //Make sure at least one array argument was specified
	  if(proc.arrayArgs.length <= 0) {
	    throw new Error("cwise: No array arguments specified")
	  }
	  
	  //Make sure arguments are correct
	  if(proc.pre.args.length > proc_args.length) {
	    throw new Error("cwise: Too many arguments in pre() block")
	  }
	  if(proc.body.args.length > proc_args.length) {
	    throw new Error("cwise: Too many arguments in body() block")
	  }
	  if(proc.post.args.length > proc_args.length) {
	    throw new Error("cwise: Too many arguments in post() block")
	  }

	  //Check debug flag
	  proc.debug = !!user_args.printCode || !!user_args.debug;
	  
	  //Retrieve name
	  proc.funcName = user_args.funcName || "cwise";
	  
	  //Read in block size
	  proc.blockSize = user_args.blockSize || 64;

	  return createThunk(proc)
	}

	compiler = compileCwise;
	return compiler;
}

var hasRequiredNdarrayOps;

function requireNdarrayOps () {
	if (hasRequiredNdarrayOps) return ndarrayOps;
	hasRequiredNdarrayOps = 1;
	(function (exports) {

		var compile = requireCompiler();

		var EmptyProc = {
		  body: "",
		  args: [],
		  thisVars: [],
		  localVars: []
		};

		function fixup(x) {
		  if(!x) {
		    return EmptyProc
		  }
		  for(var i=0; i<x.args.length; ++i) {
		    var a = x.args[i];
		    if(i === 0) {
		      x.args[i] = {name: a, lvalue:true, rvalue: !!x.rvalue, count:x.count||1 };
		    } else {
		      x.args[i] = {name: a, lvalue:false, rvalue:true, count: 1};
		    }
		  }
		  if(!x.thisVars) {
		    x.thisVars = [];
		  }
		  if(!x.localVars) {
		    x.localVars = [];
		  }
		  return x
		}

		function pcompile(user_args) {
		  return compile({
		    args:     user_args.args,
		    pre:      fixup(user_args.pre),
		    body:     fixup(user_args.body),
		    post:     fixup(user_args.proc),
		    funcName: user_args.funcName
		  })
		}

		function makeOp(user_args) {
		  var args = [];
		  for(var i=0; i<user_args.args.length; ++i) {
		    args.push("a"+i);
		  }
		  var wrapper = new Function("P", [
		    "return function ", user_args.funcName, "_ndarrayops(", args.join(","), ") {P(", args.join(","), ");return a0}"
		  ].join(""));
		  return wrapper(pcompile(user_args))
		}

		var assign_ops = {
		  add:  "+",
		  sub:  "-",
		  mul:  "*",
		  div:  "/",
		  mod:  "%",
		  band: "&",
		  bor:  "|",
		  bxor: "^",
		  lshift: "<<",
		  rshift: ">>",
		  rrshift: ">>>"
		}
		;(function(){
		  for(var id in assign_ops) {
		    var op = assign_ops[id];
		    exports[id] = makeOp({
		      args: ["array","array","array"],
		      body: {args:["a","b","c"],
		             body: "a=b"+op+"c"},
		      funcName: id
		    });
		    exports[id+"eq"] = makeOp({
		      args: ["array","array"],
		      body: {args:["a","b"],
		             body:"a"+op+"=b"},
		      funcName: id+"eq"
		    });
		    exports[id+"s"] = makeOp({
		      args: ["array", "array", "scalar"],
		      body: {args:["a","b","s"],
		             body:"a=b"+op+"s"},
		      funcName: id+"s"
		    });
		    exports[id+"seq"] = makeOp({
		      args: ["array","scalar"],
		      body: {args:["a","s"],
		             body:"a"+op+"=s"},
		      funcName: id+"seq"
		    });
		  }
		})();

		var unary_ops = {
		  not: "!",
		  bnot: "~",
		  neg: "-",
		  recip: "1.0/"
		}
		;(function(){
		  for(var id in unary_ops) {
		    var op = unary_ops[id];
		    exports[id] = makeOp({
		      args: ["array", "array"],
		      body: {args:["a","b"],
		             body:"a="+op+"b"},
		      funcName: id
		    });
		    exports[id+"eq"] = makeOp({
		      args: ["array"],
		      body: {args:["a"],
		             body:"a="+op+"a"},
		      funcName: id+"eq"
		    });
		  }
		})();

		var binary_ops = {
		  and: "&&",
		  or: "||",
		  eq: "===",
		  neq: "!==",
		  lt: "<",
		  gt: ">",
		  leq: "<=",
		  geq: ">="
		}
		;(function() {
		  for(var id in binary_ops) {
		    var op = binary_ops[id];
		    exports[id] = makeOp({
		      args: ["array","array","array"],
		      body: {args:["a", "b", "c"],
		             body:"a=b"+op+"c"},
		      funcName: id
		    });
		    exports[id+"s"] = makeOp({
		      args: ["array","array","scalar"],
		      body: {args:["a", "b", "s"],
		             body:"a=b"+op+"s"},
		      funcName: id+"s"
		    });
		    exports[id+"eq"] = makeOp({
		      args: ["array", "array"],
		      body: {args:["a", "b"],
		             body:"a=a"+op+"b"},
		      funcName: id+"eq"
		    });
		    exports[id+"seq"] = makeOp({
		      args: ["array", "scalar"],
		      body: {args:["a","s"],
		             body:"a=a"+op+"s"},
		      funcName: id+"seq"
		    });
		  }
		})();

		var math_unary = [
		  "abs",
		  "acos",
		  "asin",
		  "atan",
		  "ceil",
		  "cos",
		  "exp",
		  "floor",
		  "log",
		  "round",
		  "sin",
		  "sqrt",
		  "tan"
		]
		;(function() {
		  for(var i=0; i<math_unary.length; ++i) {
		    var f = math_unary[i];
		    exports[f] = makeOp({
		                    args: ["array", "array"],
		                    pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                    body: {args:["a","b"], body:"a=this_f(b)", thisVars:["this_f"]},
		                    funcName: f
		                  });
		    exports[f+"eq"] = makeOp({
		                      args: ["array"],
		                      pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                      body: {args: ["a"], body:"a=this_f(a)", thisVars:["this_f"]},
		                      funcName: f+"eq"
		                    });
		  }
		})();

		var math_comm = [
		  "max",
		  "min",
		  "atan2",
		  "pow"
		]
		;(function(){
		  for(var i=0; i<math_comm.length; ++i) {
		    var f= math_comm[i];
		    exports[f] = makeOp({
		                  args:["array", "array", "array"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b","c"], body:"a=this_f(b,c)", thisVars:["this_f"]},
		                  funcName: f
		                });
		    exports[f+"s"] = makeOp({
		                  args:["array", "array", "scalar"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b","c"], body:"a=this_f(b,c)", thisVars:["this_f"]},
		                  funcName: f+"s"
		                  });
		    exports[f+"eq"] = makeOp({ args:["array", "array"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b"], body:"a=this_f(a,b)", thisVars:["this_f"]},
		                  funcName: f+"eq"
		                  });
		    exports[f+"seq"] = makeOp({ args:["array", "scalar"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b"], body:"a=this_f(a,b)", thisVars:["this_f"]},
		                  funcName: f+"seq"
		                  });
		  }
		})();

		var math_noncomm = [
		  "atan2",
		  "pow"
		]
		;(function(){
		  for(var i=0; i<math_noncomm.length; ++i) {
		    var f= math_noncomm[i];
		    exports[f+"op"] = makeOp({
		                  args:["array", "array", "array"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b","c"], body:"a=this_f(c,b)", thisVars:["this_f"]},
		                  funcName: f+"op"
		                });
		    exports[f+"ops"] = makeOp({
		                  args:["array", "array", "scalar"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b","c"], body:"a=this_f(c,b)", thisVars:["this_f"]},
		                  funcName: f+"ops"
		                  });
		    exports[f+"opeq"] = makeOp({ args:["array", "array"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b"], body:"a=this_f(b,a)", thisVars:["this_f"]},
		                  funcName: f+"opeq"
		                  });
		    exports[f+"opseq"] = makeOp({ args:["array", "scalar"],
		                  pre: {args:[], body:"this_f=Math."+f, thisVars:["this_f"]},
		                  body: {args:["a","b"], body:"a=this_f(b,a)", thisVars:["this_f"]},
		                  funcName: f+"opseq"
		                  });
		  }
		})();

		exports.any = compile({
		  args:["array"],
		  pre: EmptyProc,
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "if(a){return true}", localVars: [], thisVars: []},
		  post: {args:[], localVars:[], thisVars:[], body:"return false"},
		  funcName: "any"
		});

		exports.all = compile({
		  args:["array"],
		  pre: EmptyProc,
		  body: {args:[{name:"x", lvalue:false, rvalue:true, count:1}], body: "if(!x){return false}", localVars: [], thisVars: []},
		  post: {args:[], localVars:[], thisVars:[], body:"return true"},
		  funcName: "all"
		});

		exports.sum = compile({
		  args:["array"],
		  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "this_s+=a", localVars: [], thisVars: ["this_s"]},
		  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
		  funcName: "sum"
		});

		exports.prod = compile({
		  args:["array"],
		  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=1"},
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:1}], body: "this_s*=a", localVars: [], thisVars: ["this_s"]},
		  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
		  funcName: "prod"
		});

		exports.norm2squared = compile({
		  args:["array"],
		  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:2}], body: "this_s+=a*a", localVars: [], thisVars: ["this_s"]},
		  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
		  funcName: "norm2squared"
		});
		  
		exports.norm2 = compile({
		  args:["array"],
		  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:2}], body: "this_s+=a*a", localVars: [], thisVars: ["this_s"]},
		  post: {args:[], localVars:[], thisVars:["this_s"], body:"return Math.sqrt(this_s)"},
		  funcName: "norm2"
		});
		  

		exports.norminf = compile({
		  args:["array"],
		  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:4}], body:"if(-a>this_s){this_s=-a}else if(a>this_s){this_s=a}", localVars: [], thisVars: ["this_s"]},
		  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
		  funcName: "norminf"
		});

		exports.norm1 = compile({
		  args:["array"],
		  pre: {args:[], localVars:[], thisVars:["this_s"], body:"this_s=0"},
		  body: {args:[{name:"a", lvalue:false, rvalue:true, count:3}], body: "this_s+=a<0?-a:a", localVars: [], thisVars: ["this_s"]},
		  post: {args:[], localVars:[], thisVars:["this_s"], body:"return this_s"},
		  funcName: "norm1"
		});

		exports.sup = compile({
		  args: [ "array" ],
		  pre:
		   { body: "this_h=-Infinity",
		     args: [],
		     thisVars: [ "this_h" ],
		     localVars: [] },
		  body:
		   { body: "if(_inline_1_arg0_>this_h)this_h=_inline_1_arg0_",
		     args: [{"name":"_inline_1_arg0_","lvalue":false,"rvalue":true,"count":2} ],
		     thisVars: [ "this_h" ],
		     localVars: [] },
		  post:
		   { body: "return this_h",
		     args: [],
		     thisVars: [ "this_h" ],
		     localVars: [] }
		 });

		exports.inf = compile({
		  args: [ "array" ],
		  pre:
		   { body: "this_h=Infinity",
		     args: [],
		     thisVars: [ "this_h" ],
		     localVars: [] },
		  body:
		   { body: "if(_inline_1_arg0_<this_h)this_h=_inline_1_arg0_",
		     args: [{"name":"_inline_1_arg0_","lvalue":false,"rvalue":true,"count":2} ],
		     thisVars: [ "this_h" ],
		     localVars: [] },
		  post:
		   { body: "return this_h",
		     args: [],
		     thisVars: [ "this_h" ],
		     localVars: [] }
		 });

		exports.argmin = compile({
		  args:["index","array","shape"],
		  pre:{
		    body:"{this_v=Infinity;this_i=_inline_0_arg2_.slice(0)}",
		    args:[
		      {name:"_inline_0_arg0_",lvalue:false,rvalue:false,count:0},
		      {name:"_inline_0_arg1_",lvalue:false,rvalue:false,count:0},
		      {name:"_inline_0_arg2_",lvalue:false,rvalue:true,count:1}
		      ],
		    thisVars:["this_i","this_v"],
		    localVars:[]},
		  body:{
		    body:"{if(_inline_1_arg1_<this_v){this_v=_inline_1_arg1_;for(var _inline_1_k=0;_inline_1_k<_inline_1_arg0_.length;++_inline_1_k){this_i[_inline_1_k]=_inline_1_arg0_[_inline_1_k]}}}",
		    args:[
		      {name:"_inline_1_arg0_",lvalue:false,rvalue:true,count:2},
		      {name:"_inline_1_arg1_",lvalue:false,rvalue:true,count:2}],
		    thisVars:["this_i","this_v"],
		    localVars:["_inline_1_k"]},
		  post:{
		    body:"{return this_i}",
		    args:[],
		    thisVars:["this_i"],
		    localVars:[]}
		});

		exports.argmax = compile({
		  args:["index","array","shape"],
		  pre:{
		    body:"{this_v=-Infinity;this_i=_inline_0_arg2_.slice(0)}",
		    args:[
		      {name:"_inline_0_arg0_",lvalue:false,rvalue:false,count:0},
		      {name:"_inline_0_arg1_",lvalue:false,rvalue:false,count:0},
		      {name:"_inline_0_arg2_",lvalue:false,rvalue:true,count:1}
		      ],
		    thisVars:["this_i","this_v"],
		    localVars:[]},
		  body:{
		    body:"{if(_inline_1_arg1_>this_v){this_v=_inline_1_arg1_;for(var _inline_1_k=0;_inline_1_k<_inline_1_arg0_.length;++_inline_1_k){this_i[_inline_1_k]=_inline_1_arg0_[_inline_1_k]}}}",
		    args:[
		      {name:"_inline_1_arg0_",lvalue:false,rvalue:true,count:2},
		      {name:"_inline_1_arg1_",lvalue:false,rvalue:true,count:2}],
		    thisVars:["this_i","this_v"],
		    localVars:["_inline_1_k"]},
		  post:{
		    body:"{return this_i}",
		    args:[],
		    thisVars:["this_i"],
		    localVars:[]}
		});  

		exports.random = makeOp({
		  args: ["array"],
		  pre: {args:[], body:"this_f=Math.random", thisVars:["this_f"]},
		  body: {args: ["a"], body:"a=this_f()", thisVars:["this_f"]},
		  funcName: "random"
		});

		exports.assign = makeOp({
		  args:["array", "array"],
		  body: {args:["a", "b"], body:"a=b"},
		  funcName: "assign" });

		exports.assigns = makeOp({
		  args:["array", "scalar"],
		  body: {args:["a", "b"], body:"a=b"},
		  funcName: "assigns" });


		exports.equals = compile({
		  args:["array", "array"],
		  pre: EmptyProc,
		  body: {args:[{name:"x", lvalue:false, rvalue:true, count:1},
		               {name:"y", lvalue:false, rvalue:true, count:1}], 
		        body: "if(x!==y){return false}", 
		        localVars: [], 
		        thisVars: []},
		  post: {args:[], localVars:[], thisVars:[], body:"return true"},
		  funcName: "equals"
		}); 
	} (ndarrayOps));
	return ndarrayOps;
}

var ndarrayOpsExports = requireNdarrayOps();
const ops = /*@__PURE__*/getDefaultExportFromCjs(ndarrayOpsExports);

function getPixelsInternal(buffer, mimeType) {
  // Warn for Data URIs, URLs, and file paths. Support removed in v3.
  if (!(buffer instanceof Uint8Array)) {
    throw new Error('[ndarray-pixels] Input must be Uint8Array or Buffer.');
  }
  const blob = new Blob([buffer], {
    type: mimeType
  });
  return createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none'
  }).then(img => {
    const canvas = new OffscreenCanvas(img.width, img.height);
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, img.width, img.height);
    return ndarray(new Uint8Array(pixels.data), [img.width, img.height, 4], [4, 4 * img.width, 1], 0);
  });
}

function putPixelData(array, data, frame = -1) {
  if (array.shape.length === 4) {
    return putPixelData(array.pick(frame), data, 0);
  }
  if (array.shape.length === 3) {
    if (array.shape[2] === 3) {
      ops.assign(ndarray(data, [array.shape[0], array.shape[1], 3], [4, 4 * array.shape[0], 1]), array);
      ops.assigns(ndarray(data, [array.shape[0] * array.shape[1]], [4], 3), 255);
    } else if (array.shape[2] === 4) {
      ops.assign(ndarray(data, [array.shape[0], array.shape[1], 4], [4, array.shape[0] * 4, 1]), array);
    } else if (array.shape[2] === 1) {
      ops.assign(ndarray(data, [array.shape[0], array.shape[1], 3], [4, 4 * array.shape[0], 1]), ndarray(array.data, [array.shape[0], array.shape[1], 3], [array.stride[0], array.stride[1], 0], array.offset));
      ops.assigns(ndarray(data, [array.shape[0] * array.shape[1]], [4], 3), 255);
    } else {
      throw new Error('[ndarray-pixels] Incompatible array shape.');
    }
  } else if (array.shape.length === 2) {
    ops.assign(ndarray(data, [array.shape[0], array.shape[1], 3], [4, 4 * array.shape[0], 1]), ndarray(array.data, [array.shape[0], array.shape[1], 3], [array.stride[0], array.stride[1], 0], array.offset));
    ops.assigns(ndarray(data, [array.shape[0] * array.shape[1]], [4], 3), 255);
  } else {
    throw new Error('[ndarray-pixels] Incompatible array shape.');
  }
  return data;
}

async function savePixelsInternal(pixels, options) {
  // Create OffscreenCanvas and write pixel data.
  const canvas = new OffscreenCanvas(pixels.shape[0], pixels.shape[1]);
  const context = canvas.getContext('2d');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  putPixelData(pixels, imageData.data);
  context.putImageData(imageData, 0, 0);
  return streamCanvas(canvas, options);
}
/** Creates readable stream from given OffscreenCanvas and options. */
async function streamCanvas(canvas, options) {
  const blob = await canvas.convertToBlob(options);
  const ab = await blob.arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Decodes image data to an `ndarray`.
 *
 * MIME type is optional when given a path or URL, and required when given a Uint8Array.
 *
 * Accepts `image/png` or `image/jpeg` in Node.js, and additional formats on browsers with
 * the necessary support in Canvas 2D.
 *
 * @param data
 * @param mimeType `image/jpeg`, `image/png`, etc.
 * @returns
 */
async function getPixels(data, mimeType) {
  return getPixelsInternal(data, mimeType);
}
/**
 * Encodes an `ndarray` as image data in the given format.
 *
 * If the source `ndarray` was constructed manually with default stride, use
 * `ndarray.transpose(1, 0)` to reshape it and ensure an identical result from getPixels(). For an
 * ndarray created by getPixels(), this isn't necessary.
 *
 * Accepts `image/png` or `image/jpeg` in Node.js, and additional formats on browsers with
 * the necessary support in Canvas 2D.
 *
 * @param pixels ndarray of shape W x H x 4.
 * @param typeOrOptions object with encoding options or just the type
 * @param typeOrOptions.type target format (`image/jpeg`, `image/png`, `image/webp`, etc.)
 * @param typeOrOptions.quality quality as a number from 0 to 1, inclusive
 * @returns
 */
async function savePixels(pixels, typeOrOptions) {
  let options;
  if (typeof typeOrOptions === 'string') {
    options = {
      type: typeOrOptions,
      quality: undefined
    };
  } else {
    options = {
      type: typeOrOptions.type,
      quality: typeOrOptions.quality
    };
  }
  return savePixelsInternal(pixels, options);
}

const e=(t,e)=>{if(t<=-e||t>=e)return 0;if(t>-1.1920929e-7&&t<1.1920929e-7)return 1;const n=t*Math.PI;return Math.sin(n)/n*Math.sin(n/e)/(n/e)},n=(t,n,r,a,o,s,c,h)=>{const l=2**h-1,i=t=>Math.round(t*l),p=o?2:3,u=1/r,f=Math.min(1,r),d=p/f,_=new c((Math.floor(2*(d+1))+2)*n);let y=0;for(let r=0;r<n;r++){const o=(r+.5)*u+a,h=Math.max(0,Math.floor(o-d)),l=Math.min(t-1,Math.ceil(o+d)),A=l-h+1,E=new s(A),M=new c(A);let g=0,L=0;for(let t=h;t<=l;t++){const n=e((t+.5-o)*f,p);g+=n,E[L]=n,L++;}let N=0;for(let t=0;t<E.length;t++){const e=E[t]/g;N+=e,M[t]=i(e);}M[n>>1]+=i(1-N);let S=0;for(;S<M.length&&0===M[S];)S++;let w=M.length-1;for(;w>0&&0===M[w];)w--;const m=w-S+1;_[y++]=h+S,_[y++]=m,_.set(M.subarray(S,w+1),y),y+=m;}return _},r=(t,e,n,r)=>{const[a,o]=t.shape,[s]=e.shape,c=2**(8*e.data.BYTES_PER_ELEMENT)-1,h=t=>t<0?0:t>c?c:t,l=2**(r-1),i=2*l;for(let r=0;r<o;r++){const a=r;let o=0;for(let c=0;c<s;c++){let s=n[o++],p=0,u=0,f=0,d=0;for(let e=n[o++];e>0;e--){const e=n[o++];p+=e*t.get(s,r,0),u+=e*t.get(s,r,1),f+=e*t.get(s,r,2),d+=e*t.get(s,r,3),s++;}e.set(c,a,0,h((p+l)/i)),e.set(c,a,1,h((u+l)/i)),e.set(c,a,2,h((f+l)/i)),e.set(c,a,3,h((d+l)/i));}}};var a;function o(e,o,s){if(3!==e.shape.length||3!==o.shape.length)throw new TypeError("Input and output must have exactly 3 dimensions (width, height and colorspace)");const[c,h]=e.shape,[l,i]=o.shape,p=l/c,u=i/h;let f,d;switch(o.dtype){case "uint8_clamped":case "uint8":f=Float32Array,d=Int16Array;break;case "uint16":case "uint32":f=Float64Array,d=Int32Array;break;default:throw TypeError(`Unsupported data type ${o.dtype}`)}const _=7*d.BYTES_PER_ELEMENT,y=n(c,l,p,0,s===a.LANCZOS_2,f,d,_),A=n(h,i,u,0,s===a.LANCZOS_2,f,d,_),E=ndarray(new(o.data.constructor)(l*h*4),[h,l,4]),M=E.transpose(1,0),g=o.transpose(1,0);r(e,M,y,_),r(E,g,A,_);}function s(t,e){o(t,e,a.LANCZOS_3);}function c(t,e){o(t,e,a.LANCZOS_2);}!function(t){t[t.LANCZOS_3=3]="LANCZOS_3",t[t.LANCZOS_2=2]="LANCZOS_2";}(a||(a={}));

//#region src/utils.ts
const { LINE_STRIP: LINE_STRIP$2, LINE_LOOP: LINE_LOOP$2, TRIANGLE_STRIP: TRIANGLE_STRIP$2, TRIANGLE_FAN: TRIANGLE_FAN$2 } = Primitive.Mode;
/**
* Prepares a function used in an {@link Document#transform} pipeline. Use of this wrapper is
* optional, and plain functions may be used in transform pipelines just as well. The wrapper is
* used internally so earlier pipeline stages can detect and optimize based on later stages.
* @hidden
*/
function createTransform(name, fn) {
	Object.defineProperty(fn, "name", { value: name });
	return fn;
}
/** @hidden */
function isTransformPending(context, initial, pending) {
	if (!context) return false;
	return context.stack.lastIndexOf(initial) < context.stack.lastIndexOf(pending);
}
/**
* Performs a shallow merge on an 'options' object and a 'defaults' object.
* Equivalent to `{...defaults, ...options}` _except_ that `undefined` values
* in the 'options' object are ignored.
*
* @hidden
*/
function assignDefaults(defaults, options) {
	const result = { ...defaults };
	for (const key in options) if (options[key] !== void 0) result[key] = options[key];
	return result;
}
/**
* Maps pixels from source to target textures, with a per-pixel callback.
* @hidden
*/
async function rewriteTexture(source, target, fn) {
	if (!source) return null;
	const srcImage = source.getImage();
	if (!srcImage) return null;
	const pixels = await getPixels(srcImage, source.getMimeType());
	for (let i = 0; i < pixels.shape[0]; ++i) for (let j = 0; j < pixels.shape[1]; ++j) fn(pixels, i, j);
	const dstImage = await savePixels(pixels, "image/png");
	return target.setImage(dstImage).setMimeType("image/png");
}
/** @hidden */
function getGLPrimitiveCount(prim) {
	const indices = prim.getIndices();
	const position = prim.getAttribute("POSITION");
	switch (prim.getMode()) {
		case Primitive.Mode.POINTS: return indices ? indices.getCount() : position.getCount();
		case Primitive.Mode.LINES: return indices ? indices.getCount() / 2 : position.getCount() / 2;
		case Primitive.Mode.LINE_LOOP: return indices ? indices.getCount() : position.getCount();
		case Primitive.Mode.LINE_STRIP: return indices ? indices.getCount() - 1 : position.getCount() - 1;
		case Primitive.Mode.TRIANGLES: return indices ? indices.getCount() / 3 : position.getCount() / 3;
		case Primitive.Mode.TRIANGLE_STRIP:
		case Primitive.Mode.TRIANGLE_FAN: return indices ? indices.getCount() - 2 : position.getCount() - 2;
		default: throw new Error("Unexpected mode: " + prim.getMode());
	}
}
/** @hidden */
var SetMap = class {
	_map = /* @__PURE__ */ new Map();
	get size() {
		return this._map.size;
	}
	has(k) {
		return this._map.has(k);
	}
	add(k, v) {
		let entry = this._map.get(k);
		if (!entry) {
			entry = /* @__PURE__ */ new Set();
			this._map.set(k, entry);
		}
		entry.add(v);
		return this;
	}
	get(k) {
		return this._map.get(k) || /* @__PURE__ */ new Set();
	}
	keys() {
		return this._map.keys();
	}
};
/** @hidden */
function formatBytes(bytes, decimals = 2) {
	if (bytes === 0) return "0 Bytes";
	const k = 1e3;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = [
		"Bytes",
		"KB",
		"MB",
		"GB",
		"TB",
		"PB",
		"EB",
		"ZB",
		"YB"
	];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
const _longFormatter = new Intl.NumberFormat(void 0, { maximumFractionDigits: 0 });
/** @hidden */
function formatLong(x) {
	return _longFormatter.format(x);
}
/** @hidden */
function formatDelta(a, b, decimals = 2) {
	return (a > b ? "–" : "+") + (Math.abs(a - b) / a * 100).toFixed(decimals) + "%";
}
/** @hidden */
function formatDeltaOp(a, b) {
	return `${formatLong(a)} → ${formatLong(b)} (${formatDelta(a, b)})`;
}
/**
* Returns a list of all unique vertex attributes on the given primitive and
* its morph targets.
* @hidden
*/
function deepListAttributes(prim) {
	const accessors = [];
	for (const attribute of prim.listAttributes()) accessors.push(attribute);
	for (const target of prim.listTargets()) for (const attribute of target.listAttributes()) accessors.push(attribute);
	return Array.from(new Set(accessors));
}
/** @hidden */
function deepSwapAttribute(prim, src, dst) {
	prim.swap(src, dst);
	for (const target of prim.listTargets()) target.swap(src, dst);
}
/**
* Disposes of a {@link Primitive} and any {@link Accessor Accessors} for which
* it is the last remaining parent.
* @hidden
*/
function deepDisposePrimitive(prim) {
	const indices = prim.getIndices();
	const attributes = deepListAttributes(prim);
	prim.dispose();
	if (indices && !isUsed(indices)) indices.dispose();
	for (const attribute of attributes) if (!isUsed(attribute)) attribute.dispose();
}
/** @hidden */
function shallowEqualsArray(a, b) {
	if (a == null && b == null) return true;
	if (a == null || b == null) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
	return true;
}
/** Clones an {@link Accessor} without creating a copy of its underlying TypedArray data. */
function shallowCloneAccessor(document, accessor) {
	return document.createAccessor(accessor.getName()).setArray(accessor.getArray()).setType(accessor.getType()).setBuffer(accessor.getBuffer()).setNormalized(accessor.getNormalized()).setSparse(accessor.getSparse());
}
/** @hidden */
function createIndices(count, maxIndex = count) {
	const array = createIndicesEmpty(count, maxIndex);
	for (let i = 0; i < array.length; i++) array[i] = i;
	return array;
}
/** @hidden */
function createIndicesEmpty(count, maxIndex = count) {
	return maxIndex <= 65534 ? new Uint16Array(count) : new Uint32Array(count);
}
/** @hidden */
function isUsed(prop) {
	return prop.listParents().some((parent) => parent.propertyType !== PropertyType.ROOT);
}
/** @hidden */
function isEmptyObject(object) {
	for (const _key in object) return false;
	return true;
}
/**
* Creates a unique key associated with the structure and draw call characteristics of
* a {@link Primitive}, independent of its vertex content. Helper method, used to
* identify candidate Primitives for joining.
* @hidden
*/
function createPrimGroupKey(prim) {
	const document = Document.fromGraph(prim.getGraph());
	const material = prim.getMaterial();
	return `${document.getRoot().listMaterials().indexOf(material)}|${prim.getMode()}|${!!prim.getIndices()}|${prim.listSemantics().sort().map((semantic) => {
		const attribute = prim.getAttribute(semantic);
		return `${semantic}:${attribute.getElementSize()}:${attribute.getComponentType()}`;
	}).join("+")}|${prim.listTargets().map((target) => {
		return target.listSemantics().sort().map((semantic) => {
			const attribute = prim.getAttribute(semantic);
			return `${semantic}:${attribute.getElementSize()}:${attribute.getComponentType()}`;
		}).join("+");
	}).join("~")}`;
}
/**
* Scales `size` NxN dimensions to fit within `limit` NxN dimensions, without
* changing aspect ratio. If `size` <= `limit` in all dimensions, returns `size`.
* @hidden
*/
function fitWithin(size, limit) {
	const [maxWidth, maxHeight] = limit;
	const [srcWidth, srcHeight] = size;
	if (srcWidth <= maxWidth && srcHeight <= maxHeight) return size;
	let dstWidth = srcWidth;
	let dstHeight = srcHeight;
	if (dstWidth > maxWidth) {
		dstHeight = Math.floor(dstHeight * (maxWidth / dstWidth));
		dstWidth = maxWidth;
	}
	if (dstHeight > maxHeight) {
		dstWidth = Math.floor(dstWidth * (maxHeight / dstHeight));
		dstHeight = maxHeight;
	}
	return [dstWidth, dstHeight];
}
/**
* Scales `size` NxN dimensions to the specified power of two.
* @hidden
*/
function fitPowerOfTwo(size, method) {
	if (isPowerOfTwo(size[0]) && isPowerOfTwo(size[1])) return size;
	switch (method) {
		case "nearest-pot": return size.map(nearestPowerOfTwo);
		case "ceil-pot": return size.map(ceilPowerOfTwo$1);
		case "floor-pot": return size.map(floorPowerOfTwo);
	}
}
function isPowerOfTwo(value) {
	if (value <= 2) return true;
	return (value & value - 1) === 0 && value !== 0;
}
function nearestPowerOfTwo(value) {
	if (value <= 4) return 4;
	const lo = floorPowerOfTwo(value);
	const hi = ceilPowerOfTwo$1(value);
	if (hi - value > value - lo) return lo;
	return hi;
}
function floorPowerOfTwo(value) {
	return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}
function ceilPowerOfTwo$1(value) {
	return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}
/**
* Whether the primitive mode supports KHR_mesh_primitive_restart.
* @hidden
* @internal
*/
function isPrimitiveRestartMode(mode) {
	return mode === LINE_STRIP$2 || mode === LINE_LOOP$2 || mode === TRIANGLE_STRIP$2 || mode === TRIANGLE_FAN$2;
}
/**
* Returns the applicable primitive restart value (see KHR_mesh_primitive_restart)
* for the given index accessor.
* @hidden
* @internal
*/
function getPrimitiveRestartIndex(componentType) {
	switch (componentType) {
		case Accessor.ComponentType.UNSIGNED_INT: return 4294967295;
		case Accessor.ComponentType.UNSIGNED_SHORT: return 65535;
		case Accessor.ComponentType.UNSIGNED_BYTE: return 255;
		default: return -1;
	}
}
//#endregion
//#region src/center.ts
const NAME$26 = "center";
const CENTER_DEFAULTS = { pivot: "center" };
/**
* Centers the {@link Scene} at the origin, or above/below it. Transformations from animation,
* skinning, and morph targets are not taken into account.
*
* Example:
*
* ```ts
* await document.transform(center({pivot: 'below'}));
* ```
*
* @category Transforms
*/
function center(_options = CENTER_DEFAULTS) {
	const options = assignDefaults(CENTER_DEFAULTS, _options);
	return createTransform(NAME$26, (doc) => {
		const logger = doc.getLogger();
		const root = doc.getRoot();
		const isAnimated = root.listAnimations().length > 0 || root.listSkins().length > 0;
		doc.getRoot().listScenes().forEach((scene, index) => {
			logger.debug(`${NAME$26}: Scene ${index + 1} / ${root.listScenes().length}.`);
			let pivot;
			if (typeof options.pivot === "string") {
				const bbox = getBounds$1(scene);
				pivot = [
					(bbox.max[0] - bbox.min[0]) / 2 + bbox.min[0],
					(bbox.max[1] - bbox.min[1]) / 2 + bbox.min[1],
					(bbox.max[2] - bbox.min[2]) / 2 + bbox.min[2]
				];
				if (options.pivot === "above") pivot[1] = bbox.max[1];
				if (options.pivot === "below") pivot[1] = bbox.min[1];
			} else pivot = options.pivot;
			logger.debug(`${NAME$26}: Pivot "${pivot.join(", ")}".`);
			const offset = [
				-1 * pivot[0],
				-1 * pivot[1],
				-1 * pivot[2]
			];
			if (isAnimated) {
				logger.debug(`${NAME$26}: Model contains animation or skin. Adding a wrapper node.`);
				const offsetNode = doc.createNode("Pivot").setTranslation(offset);
				scene.listChildren().forEach((child) => offsetNode.addChild(child));
				scene.addChild(offsetNode);
			} else {
				logger.debug(`${NAME$26}: Skipping wrapper, offsetting all root nodes.`);
				scene.listChildren().forEach((child) => {
					const t = child.getTranslation();
					child.setTranslation([
						t[0] + offset[0],
						t[1] + offset[1],
						t[2] + offset[2]
					]);
				});
			}
		});
		logger.debug(`${NAME$26}: Complete.`);
	});
}
//#endregion
//#region src/list-node-scenes.ts
/**
* Finds the parent {@link Scene Scenes} associated with the given {@link Node}.
* In most cases a Node is associated with only one Scene, but it is possible
* for a Node to be located in two or more Scenes, or none at all.
*
* Example:
*
* ```typescript
* import { listNodeScenes } from '@gltf-transform/functions';
*
* const node = document.getRoot().listNodes()
*  .find((node) => node.getName() === 'MyNode');
*
* const scenes = listNodeScenes(node);
* ```
*/
function listNodeScenes(node) {
	const visited = /* @__PURE__ */ new Set();
	let child = node;
	let parent;
	while (parent = child.getParentNode()) {
		if (visited.has(parent)) throw new Error("Circular dependency in scene graph.");
		visited.add(parent);
		child = parent;
	}
	return child.listParents().filter((parent) => parent instanceof Scene);
}
//#endregion
//#region src/clear-node-parent.ts
/**
* Clears the parent of the given {@link Node}, leaving it attached
* directly to its {@link Scene}. Inherited transforms will be applied
* to the Node. This operation changes the Node's local transform,
* but leaves its world transform unchanged.
*
* Example:
*
* ```typescript
* import { clearNodeParent } from '@gltf-transform/functions';
*
* scene.traverse((node) => { ... }); // Scene → … → Node
*
* clearNodeParent(node);
*
* scene.traverse((node) => { ... }); // Scene → Node
* ```
*
* To clear _all_ transforms of a Node, first clear its inherited transforms with
* {@link clearNodeParent}, then clear the local transform with {@link clearNodeTransform}.
*/
function clearNodeParent(node) {
	const scenes = listNodeScenes(node);
	const parent = node.getParentNode();
	if (!parent) return node;
	node.setMatrix(node.getWorldMatrix());
	parent.removeChild(node);
	for (const scene of scenes) scene.addChild(node);
	return node;
}
//#endregion
//#region ../../node_modules/gl-matrix/esm/common.js
var ARRAY_TYPE = typeof Float32Array !== "undefined" ? Float32Array : Array;
//#endregion
//#region ../../node_modules/gl-matrix/esm/mat4.js
/**
* Inverts a mat4
*
* @param {mat4} out the receiving matrix
* @param {ReadonlyMat4} a the source matrix
* @returns {mat4 | null} out, or null if source matrix is not invertible
*/
function invert$1(out, a) {
	var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
	var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
	var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
	var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
	var b00 = a00 * a11 - a01 * a10;
	var b01 = a00 * a12 - a02 * a10;
	var b02 = a00 * a13 - a03 * a10;
	var b03 = a01 * a12 - a02 * a11;
	var b04 = a01 * a13 - a03 * a11;
	var b05 = a02 * a13 - a03 * a12;
	var b06 = a20 * a31 - a21 * a30;
	var b07 = a20 * a32 - a22 * a30;
	var b08 = a20 * a33 - a23 * a30;
	var b09 = a21 * a32 - a22 * a31;
	var b10 = a21 * a33 - a23 * a31;
	var b11 = a22 * a33 - a23 * a32;
	var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
	if (!det) return null;
	det = 1 / det;
	out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
	out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
	out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
	out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
	out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
	out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
	out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
	out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
	out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
	out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
	out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
	out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
	out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
	out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
	out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
	out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
	return out;
}
/**
* Calculates the determinant of a mat4
*
* @param {ReadonlyMat4} a the source matrix
* @returns {Number} determinant of a
*/
function determinant(a) {
	var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
	var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
	var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
	var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
	var b0 = a00 * a11 - a01 * a10;
	var b1 = a00 * a12 - a02 * a10;
	var b2 = a01 * a12 - a02 * a11;
	var b3 = a20 * a31 - a21 * a30;
	var b4 = a20 * a32 - a22 * a30;
	var b5 = a21 * a32 - a22 * a31;
	var b6 = a00 * b5 - a01 * b4 + a02 * b3;
	var b7 = a10 * b5 - a11 * b4 + a12 * b3;
	var b8 = a20 * b2 - a21 * b1 + a22 * b0;
	var b9 = a30 * b2 - a31 * b1 + a32 * b0;
	return a13 * b6 - a03 * b7 + a33 * b8 - a23 * b9;
}
/**
* Multiplies two mat4s
*
* @param {mat4} out the receiving matrix
* @param {ReadonlyMat4} a the first operand
* @param {ReadonlyMat4} b the second operand
* @returns {mat4} out
*/
function multiply$2(out, a, b) {
	var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
	var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
	var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
	var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
	var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
	out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	b0 = b[4];
	b1 = b[5];
	b2 = b[6];
	b3 = b[7];
	out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	b0 = b[8];
	b1 = b[9];
	b2 = b[10];
	b3 = b[11];
	out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	b0 = b[12];
	b1 = b[13];
	b2 = b[14];
	b3 = b[15];
	out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
	out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
	out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
	out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
	return out;
}
/**
* Creates a matrix from a vector scaling
* This is equivalent to (but much faster than):
*
*     mat4.identity(dest);
*     mat4.scale(dest, dest, vec);
*
* @param {mat4} out mat4 receiving operation result
* @param {ReadonlyVec3} v Scaling vector
* @returns {mat4} out
*/
function fromScaling(out, v) {
	out[0] = v[0];
	out[1] = 0;
	out[2] = 0;
	out[3] = 0;
	out[4] = 0;
	out[5] = v[1];
	out[6] = 0;
	out[7] = 0;
	out[8] = 0;
	out[9] = 0;
	out[10] = v[2];
	out[11] = 0;
	out[12] = 0;
	out[13] = 0;
	out[14] = 0;
	out[15] = 1;
	return out;
}
/**
* Creates a matrix from a quaternion rotation, vector translation and vector scale
* This is equivalent to (but much faster than):
*
*     mat4.identity(dest);
*     mat4.translate(dest, dest, vec);
*     let quatMat = mat4.create();
*     mat4.fromQuat(quatMat, quat);
*     mat4.multiply(dest, dest, quatMat);
*     mat4.scale(dest, dest, scale)
*
* @param {mat4} out mat4 receiving operation result
* @param {quat} q Rotation quaternion
* @param {ReadonlyVec3} v Translation vector
* @param {ReadonlyVec3} s Scaling vector
* @returns {mat4} out
*/
function fromRotationTranslationScale(out, q, v, s) {
	var x = q[0], y = q[1], z = q[2], w = q[3];
	var x2 = x + x;
	var y2 = y + y;
	var z2 = z + z;
	var xx = x * x2;
	var xy = x * y2;
	var xz = x * z2;
	var yy = y * y2;
	var yz = y * z2;
	var zz = z * z2;
	var wx = w * x2;
	var wy = w * y2;
	var wz = w * z2;
	var sx = s[0];
	var sy = s[1];
	var sz = s[2];
	out[0] = (1 - (yy + zz)) * sx;
	out[1] = (xy + wz) * sx;
	out[2] = (xz - wy) * sx;
	out[3] = 0;
	out[4] = (xy - wz) * sy;
	out[5] = (1 - (xx + zz)) * sy;
	out[6] = (yz + wx) * sy;
	out[7] = 0;
	out[8] = (xz + wy) * sz;
	out[9] = (yz - wx) * sz;
	out[10] = (1 - (xx + yy)) * sz;
	out[11] = 0;
	out[12] = v[0];
	out[13] = v[1];
	out[14] = v[2];
	out[15] = 1;
	return out;
}
//#endregion
//#region src/get-vertex-count.ts
/**
* Various methods of estimating a vertex count. For some background on why
* multiple definitions of a vertex count should exist, see [_Vertex Count
* Higher in Engine than in 3D Software_](https://shahriyarshahrabi.medium.com/vertex-count-higher-in-engine-than-in-3d-software-badc348ada66).
* Totals for a {@link Scene}, {@link Node}, or {@link Mesh} will not
* necessarily match the sum of the totals for each {@link Primitive}. Choose
* the appropriate method for a relevant total or estimate:
*
* - {@link getSceneVertexCount}
* - {@link getNodeVertexCount}
* - {@link getMeshVertexCount}
* - {@link getPrimitiveVertexCount}
*
* Many rendering features, such as volumetric transmission, may lead
* to additional passes over some or all vertices. These tradeoffs are
* implementation-dependent, and not considered here.
*/
let VertexCountMethod = /* @__PURE__ */ function(VertexCountMethod) {
	/**
	* Expected number of vertices processed by the vertex shader for one render
	* pass, without considering the vertex cache.
	*/
	VertexCountMethod["RENDER"] = "render";
	/**
	* Expected number of vertices processed by the vertex shader for one render
	* pass, assuming an Average Transform to Vertex Ratio (ATVR) of 1. Approaching
	* this result requires optimizing for locality of vertex references (see
	* {@link reorder}).
	*
	* References:
	* - [ACMR and ATVR](https://www.realtimerendering.com/blog/acmr-and-atvr/), Real-Time Rendering
	*/
	VertexCountMethod["RENDER_CACHED"] = "render-cached";
	/**
	* Expected number of vertices uploaded to the GPU, assuming that a client
	* uploads each unique {@link Accessor} only once. Unless glTF vertex
	* attributes are pre-processed to a known buffer layout, and the client is
	* optimized for that buffer layout, this total will be optimistic.
	*/
	VertexCountMethod["UPLOAD"] = "upload";
	/**
	* Expected number of vertices uploaded to the GPU, assuming that a client
	* uploads each unique {@link Primitive} individually, duplicating vertex
	* attribute {@link Accessor Accessors} shared by multiple primitives, but
	* never uploading the same Mesh or Primitive to GPU memory more than once.
	*/
	VertexCountMethod["UPLOAD_NAIVE"] = "upload-naive";
	/**
	* Total number of unique vertices represented, considering all attributes of
	* each vertex, and removing any duplicates. Has no direct relationship to
	* runtime characteristics, but may be helpful in identifying asset
	* optimization opportunities.
	*
	* @hidden TODO(feat): Not yet implemented.
	* @internal
	*/
	VertexCountMethod["DISTINCT"] = "distinct";
	/**
	* Total number of unique vertices represented, considering only vertex
	* positions, and removing any duplicates. Has no direct relationship to
	* runtime characteristics, but may be helpful in identifying asset
	* optimization opportunities.
	*
	* @hidden TODO(feat): Not yet implemented.
	* @internal
	*/
	VertexCountMethod["DISTINCT_POSITION"] = "distinct-position";
	/**
	* Number of vertex positions never used by any {@link Primitive}. If all
	* vertices are unused, this total will match `UPLOAD`.
	*/
	VertexCountMethod["UNUSED"] = "unused";
	return VertexCountMethod;
}({});
/**
* Computes total number of vertices in a {@link Scene}, by the
* specified method. Totals for the Scene will not necessarily match the sum
* of the totals for each {@link Mesh} or {@link Primitive} within it. See
* {@link VertexCountMethod} for available methods.
*/
function getSceneVertexCount(scene, method) {
	return _getSubtreeVertexCount(scene, method);
}
/**
* Computes total number of vertices in a {@link Node}, by the
* specified method. Totals for the node will not necessarily match the sum
* of the totals for each {@link Mesh} or {@link Primitive} within it. See
* {@link VertexCountMethod} for available methods.
*/
function getNodeVertexCount(node, method) {
	return _getSubtreeVertexCount(node, method);
}
function _getSubtreeVertexCount(node, method) {
	const instancedMeshes = [];
	const nonInstancedMeshes = [];
	const meshes = [];
	node.traverse((node) => {
		const mesh = node.getMesh();
		const batch = node.getExtension("EXT_mesh_gpu_instancing");
		if (batch && mesh) {
			meshes.push(mesh);
			instancedMeshes.push([batch.listAttributes()[0].getCount(), mesh]);
		} else if (mesh) {
			meshes.push(mesh);
			nonInstancedMeshes.push(mesh);
		}
	});
	const positions = meshes.flatMap((mesh) => mesh.listPrimitives()).map((prim) => prim.getAttribute("POSITION"));
	const uniquePositions = Array.from(new Set(positions));
	const uniqueMeshes = Array.from(new Set(meshes));
	const uniquePrims = Array.from(new Set(uniqueMeshes.flatMap((mesh) => mesh.listPrimitives())));
	switch (method) {
		case "render":
		case "render-cached": return _sum(nonInstancedMeshes.map((mesh) => getMeshVertexCount(mesh, method))) + _sum(instancedMeshes.map(([batch, mesh]) => batch * getMeshVertexCount(mesh, method)));
		case "upload-naive": return _sum(uniqueMeshes.map((mesh) => getMeshVertexCount(mesh, method)));
		case "upload": return _sum(uniquePositions.map((attribute) => attribute.getCount()));
		case "distinct":
		case "distinct-position": return _assertNotImplemented(method);
		case "unused": return _sumUnused(uniquePrims);
		default: return _assertUnreachable(method);
	}
}
/**
* Computes total number of vertices in a {@link Mesh}, by the
* specified method. Totals for the Mesh will not necessarily match the sum
* of the totals for each {@link Primitive} within it. See
* {@link VertexCountMethod} for available methods.
*/
function getMeshVertexCount(mesh, method) {
	const prims = mesh.listPrimitives();
	const uniquePrims = Array.from(new Set(prims));
	const uniquePositions = Array.from(new Set(uniquePrims.map((prim) => prim.getAttribute("POSITION"))));
	switch (method) {
		case "render":
		case "render-cached":
		case "upload-naive": return _sum(prims.map((prim) => getPrimitiveVertexCount(prim, method)));
		case "upload": return _sum(uniquePositions.map((attribute) => attribute.getCount()));
		case "distinct":
		case "distinct-position": return _assertNotImplemented(method);
		case "unused": return _sumUnused(uniquePrims);
		default: return _assertUnreachable(method);
	}
}
/**
* Computes total number of vertices in a {@link Primitive}, by the
* specified method. See {@link VertexCountMethod} for available methods.
*/
function getPrimitiveVertexCount(prim, method) {
	const position = prim.getAttribute("POSITION");
	const indices = prim.getIndices();
	switch (method) {
		case "render": return indices ? indices.getCount() : position.getCount();
		case "render-cached": return indices ? new Set(indices.getArray()).size : position.getCount();
		case "upload-naive":
		case "upload": return position.getCount();
		case "distinct":
		case "distinct-position": return _assertNotImplemented(method);
		case "unused": return indices ? position.getCount() - new Set(indices.getArray()).size : 0;
		default: return _assertUnreachable(method);
	}
}
function _sum(values) {
	let total = 0;
	for (let i = 0; i < values.length; i++) total += values[i];
	return total;
}
function _sumUnused(prims) {
	const attributeIndexMap = /* @__PURE__ */ new Map();
	for (const prim of prims) {
		const position = prim.getAttribute("POSITION");
		const indices = prim.getIndices();
		const indicesSet = attributeIndexMap.get(position) || /* @__PURE__ */ new Set();
		indicesSet.add(indices);
		attributeIndexMap.set(position, indicesSet);
	}
	let unused = 0;
	for (const [position, indicesSet] of attributeIndexMap) {
		if (indicesSet.has(null)) continue;
		const usedIndices = new Uint8Array(position.getCount());
		for (const indices of indicesSet) {
			const indicesArray = indices.getArray();
			for (let i = 0, il = indicesArray.length; i < il; i++) usedIndices[indicesArray[i]] = 1;
		}
		for (let i = 0, il = position.getCount(); i < il; i++) if (usedIndices[i] === 0) unused++;
	}
	return unused;
}
function _assertNotImplemented(x) {
	throw new Error(`Not implemented: ${x}`);
}
function _assertUnreachable(x) {
	throw new Error(`Unexpected value: ${x}`);
}
//#endregion
//#region src/hash-table.ts
/** Flags 'empty' values in a Uint32Array index. */
const EMPTY_U32$1 = 2 ** 32 - 1;
var VertexStream = class {
	attributes = [];
	/** Temporary vertex views in 4-byte-aligned memory. */
	u8;
	u32;
	constructor(prim) {
		let byteStride = 0;
		for (const attribute of deepListAttributes(prim)) byteStride += this._initAttribute(attribute);
		this.u8 = new Uint8Array(byteStride);
		this.u32 = new Uint32Array(this.u8.buffer);
	}
	_initAttribute(attribute) {
		const array = attribute.getArray();
		const u8 = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
		const byteStride = attribute.getElementSize() * attribute.getComponentSize();
		const paddedByteStride = BufferUtils.padNumber(byteStride);
		this.attributes.push({
			u8,
			byteStride,
			paddedByteStride
		});
		return paddedByteStride;
	}
	hash(index) {
		let byteOffset = 0;
		for (const { u8, byteStride, paddedByteStride } of this.attributes) {
			for (let i = 0; i < paddedByteStride; i++) if (i < byteStride) this.u8[byteOffset + i] = u8[index * byteStride + i];
			else this.u8[byteOffset + i] = 0;
			byteOffset += paddedByteStride;
		}
		return murmurHash2(0, this.u32);
	}
	equal(a, b) {
		for (const { u8, byteStride } of this.attributes) for (let j = 0; j < byteStride; j++) if (u8[a * byteStride + j] !== u8[b * byteStride + j]) return false;
		return true;
	}
};
/**
* References:
* - https://github.com/mikolalysenko/murmurhash-js/blob/f19136e9f9c17f8cddc216ca3d44ec7c5c502f60/murmurhash2_gc.js#L14
* - https://github.com/zeux/meshoptimizer/blob/e47e1be6d3d9513153188216455bdbed40a206ef/src/indexgenerator.cpp#L12
*/
function murmurHash2(h, key) {
	const m = 1540483477;
	const r = 24;
	for (let i = 0, il = key.length; i < il; i++) {
		let k = key[i];
		k = Math.imul(k, m) >>> 0;
		k = (k ^ k >> r) >>> 0;
		k = Math.imul(k, m) >>> 0;
		h = Math.imul(h, m) >>> 0;
		h = (h ^ k) >>> 0;
	}
	return h;
}
function hashLookup(table, buckets, stream, key, empty = EMPTY_U32$1) {
	const hashmod = buckets - 1;
	let bucket = stream.hash(key) & hashmod;
	for (let probe = 0; probe <= hashmod; probe++) {
		const item = table[bucket];
		if (item === empty || stream.equal(item, key)) return bucket;
		bucket = bucket + probe + 1 & hashmod;
	}
	throw new Error("Hash table full.");
}
//#endregion
//#region src/compact-primitive.ts
/**
* Rewrites a {@link Primitive} such that all unused vertices in its vertex
* attributes are removed. When multiple Primitives share vertex attributes,
* each indexing only a few, compaction can be used to produce Primitives
* each having smaller, independent vertex streams instead.
*
* Regardless of whether the Primitive is indexed or contains unused vertices,
* compaction will clone every {@link Accessor}. The resulting Primitive will
* share no Accessors with other Primitives, allowing later changes to
* the vertex stream to be applied in isolation.
*
* Example:
*
* ```javascript
* import { compactPrimitive, transformMesh } from '@gltf-transform/functions';
* import { fromTranslation } from 'gl-matrix/mat4';
*
* const mesh = document.getRoot().listMeshes().find((mesh) => mesh.getName() === 'MyMesh');
* const prim = mesh.listPrimitives().find((prim) => { ... });
*
* // Compact primitive, removing unused vertices and detaching shared vertex
* // attributes. Without compaction, `transformPrimitive` might affect other
* // primitives sharing the same vertex attributes.
* compactPrimitive(prim);
*
* // Transform primitive vertices, y += 10.
* transformPrimitive(prim, fromTranslation([], [0, 10, 0]));
* ```
*
* Parameters 'remap' and 'dstVertexCount' are optional. When either is
* provided, the other must be provided as well. If one or both are missing,
* both will be computed from the mesh indices.
*
* @param remap - Mapping. Array index represents vertex index in the source
*		attributes, array value represents index in the resulting compacted
*		primitive. When omitted, calculated from indices.
* @param dstVertexcount - Number of unique vertices in compacted primitive.
*		When omitted, calculated from indices.
*/
function compactPrimitive(prim, remap, dstVertexCount) {
	const document = Document.fromGraph(prim.getGraph());
	if (!remap || !dstVertexCount) [remap, dstVertexCount] = createCompactPlan(prim);
	const srcIndices = prim.getIndices();
	const srcIndicesArray = srcIndices ? srcIndices.getArray() : null;
	const srcIndicesCount = getPrimitiveVertexCount(prim, "render");
	const dstIndices = document.createAccessor();
	const dstIndicesCount = srcIndicesCount;
	const dstIndicesArray = createIndicesEmpty(dstIndicesCount, dstVertexCount);
	for (let i = 0; i < dstIndicesCount; i++) dstIndicesArray[i] = remap[srcIndicesArray ? srcIndicesArray[i] : i];
	prim.setIndices(dstIndices.setArray(dstIndicesArray));
	const srcAttributesPrev = deepListAttributes(prim);
	for (const srcAttribute of prim.listAttributes()) {
		const dstAttribute = shallowCloneAccessor(document, srcAttribute);
		compactAttribute(srcAttribute, srcIndices, remap, dstAttribute, dstVertexCount);
		prim.swap(srcAttribute, dstAttribute);
	}
	for (const target of prim.listTargets()) for (const srcAttribute of target.listAttributes()) {
		const dstAttribute = shallowCloneAccessor(document, srcAttribute);
		compactAttribute(srcAttribute, srcIndices, remap, dstAttribute, dstVertexCount);
		target.swap(srcAttribute, dstAttribute);
	}
	if (srcIndices && srcIndices.listParents().length === 1) srcIndices.dispose();
	for (const srcAttribute of srcAttributesPrev) if (srcAttribute.listParents().length === 1) srcAttribute.dispose();
	return prim;
}
/**
* Copies srcAttribute to dstAttribute, using the given indices and remap (srcIndex -> dstIndex).
* Any existing array in dstAttribute is replaced. Vertices not used by the index are eliminated,
* leaving a compact attribute.
* @hidden
* @internal
*/
function compactAttribute(srcAttribute, srcIndices, remap, dstAttribute, dstVertexCount) {
	const elementSize = srcAttribute.getElementSize();
	const srcArray = srcAttribute.getArray();
	const srcIndicesArray = srcIndices ? srcIndices.getArray() : null;
	const srcIndicesCount = srcIndices ? srcIndices.getCount() : srcAttribute.getCount();
	const dstArray = new srcArray.constructor(dstVertexCount * elementSize);
	const dstDone = new Uint8Array(dstVertexCount);
	for (let i = 0; i < srcIndicesCount; i++) {
		const srcIndex = srcIndicesArray ? srcIndicesArray[i] : i;
		const dstIndex = remap[srcIndex];
		if (dstDone[dstIndex]) continue;
		for (let j = 0; j < elementSize; j++) dstArray[dstIndex * elementSize + j] = srcArray[srcIndex * elementSize + j];
		dstDone[dstIndex] = 1;
	}
	return dstAttribute.setArray(dstArray);
}
/**
* Creates a 'remap' and 'dstVertexCount' plan for indexed primitives,
* such that they can be rewritten with {@link compactPrimitive} removing
* any non-rendered vertices.
* @hidden
* @internal
*/
function createCompactPlan(prim) {
	const srcVertexCount = getPrimitiveVertexCount(prim, "upload");
	const indices = prim.getIndices();
	const indicesArray = indices ? indices.getArray() : null;
	if (!indices || !indicesArray) return [createIndices(srcVertexCount, 1e6), srcVertexCount];
	const remap = new Uint32Array(srcVertexCount).fill(EMPTY_U32$1);
	let dstVertexCount = 0;
	for (let i = 0; i < indicesArray.length; i++) {
		const srcIndex = indicesArray[i];
		if (remap[srcIndex] === EMPTY_U32$1) remap[srcIndex] = dstVertexCount++;
	}
	return [remap, dstVertexCount];
}
//#endregion
//#region ../../node_modules/gl-matrix/esm/mat3.js
/**
* 3x3 Matrix
* @module mat3
*/
/**
* Creates a new identity mat3
*
* @returns {mat3} a new 3x3 matrix
*/
function create$2() {
	var out = new ARRAY_TYPE(9);
	if (ARRAY_TYPE != Float32Array) {
		out[1] = 0;
		out[2] = 0;
		out[3] = 0;
		out[5] = 0;
		out[6] = 0;
		out[7] = 0;
	}
	out[0] = 1;
	out[4] = 1;
	out[8] = 1;
	return out;
}
/**
* Copies the upper-left 3x3 values into the given mat3.
*
* @param {mat3} out the receiving 3x3 matrix
* @param {ReadonlyMat4} a   the source 4x4 matrix
* @returns {mat3} out
*/
function fromMat4(out, a) {
	out[0] = a[0];
	out[1] = a[1];
	out[2] = a[2];
	out[3] = a[4];
	out[4] = a[5];
	out[5] = a[6];
	out[6] = a[8];
	out[7] = a[9];
	out[8] = a[10];
	return out;
}
/**
* Transpose the values of a mat3
*
* @param {mat3} out the receiving matrix
* @param {ReadonlyMat3} a the source matrix
* @returns {mat3} out
*/
function transpose(out, a) {
	if (out === a) {
		var a01 = a[1], a02 = a[2], a12 = a[5];
		out[1] = a[3];
		out[2] = a[6];
		out[3] = a01;
		out[5] = a[7];
		out[6] = a02;
		out[7] = a12;
	} else {
		out[0] = a[0];
		out[1] = a[3];
		out[2] = a[6];
		out[3] = a[1];
		out[4] = a[4];
		out[5] = a[7];
		out[6] = a[2];
		out[7] = a[5];
		out[8] = a[8];
	}
	return out;
}
/**
* Inverts a mat3
*
* @param {mat3} out the receiving matrix
* @param {ReadonlyMat3} a the source matrix
* @returns {mat3 | null} out, or null if source matrix is not invertible
*/
function invert(out, a) {
	var a00 = a[0], a01 = a[1], a02 = a[2];
	var a10 = a[3], a11 = a[4], a12 = a[5];
	var a20 = a[6], a21 = a[7], a22 = a[8];
	var b01 = a22 * a11 - a12 * a21;
	var b11 = -a22 * a10 + a12 * a20;
	var b21 = a21 * a10 - a11 * a20;
	var det = a00 * b01 + a01 * b11 + a02 * b21;
	if (!det) return null;
	det = 1 / det;
	out[0] = b01 * det;
	out[1] = (-a22 * a01 + a02 * a21) * det;
	out[2] = (a12 * a01 - a02 * a11) * det;
	out[3] = b11 * det;
	out[4] = (a22 * a00 - a02 * a20) * det;
	out[5] = (-a12 * a00 + a02 * a10) * det;
	out[6] = b21 * det;
	out[7] = (-a21 * a00 + a01 * a20) * det;
	out[8] = (a11 * a00 - a01 * a10) * det;
	return out;
}
//#endregion
//#region ../../node_modules/gl-matrix/esm/vec3.js
/**
* 3 Dimensional Vector
* @module vec3
*/
/**
* Creates a new, empty vec3
*
* @returns {vec3} a new 3D vector
*/
function create$1() {
	var out = new ARRAY_TYPE(3);
	if (ARRAY_TYPE != Float32Array) {
		out[0] = 0;
		out[1] = 0;
		out[2] = 0;
	}
	return out;
}
/**
* Multiplies two vec3's
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a the first operand
* @param {ReadonlyVec3} b the second operand
* @returns {vec3} out
*/
function multiply$1(out, a, b) {
	out[0] = a[0] * b[0];
	out[1] = a[1] * b[1];
	out[2] = a[2] * b[2];
	return out;
}
/**
* Returns the minimum of two vec3's
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a the first operand
* @param {ReadonlyVec3} b the second operand
* @returns {vec3} out
*/
function min(out, a, b) {
	out[0] = Math.min(a[0], b[0]);
	out[1] = Math.min(a[1], b[1]);
	out[2] = Math.min(a[2], b[2]);
	return out;
}
/**
* Returns the maximum of two vec3's
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a the first operand
* @param {ReadonlyVec3} b the second operand
* @returns {vec3} out
*/
function max(out, a, b) {
	out[0] = Math.max(a[0], b[0]);
	out[1] = Math.max(a[1], b[1]);
	out[2] = Math.max(a[2], b[2]);
	return out;
}
/**
* Scales a vec3 by a scalar number
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a the vector to scale
* @param {Number} b amount to scale the vector by
* @returns {vec3} out
*/
function scale$1(out, a, b) {
	out[0] = a[0] * b;
	out[1] = a[1] * b;
	out[2] = a[2] * b;
	return out;
}
/**
* Normalize a vec3
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a vector to normalize
* @returns {vec3} out
*/
function normalize(out, a) {
	var x = a[0];
	var y = a[1];
	var z = a[2];
	var len = x * x + y * y + z * z;
	if (len > 0) len = 1 / Math.sqrt(len);
	out[0] = a[0] * len;
	out[1] = a[1] * len;
	out[2] = a[2] * len;
	return out;
}
/**
* Transforms the vec3 with a mat4.
* 4th vector component is implicitly '1'
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a the vector to transform
* @param {ReadonlyMat4} m matrix to transform with
* @returns {vec3} out
*/
function transformMat4(out, a, m) {
	var x = a[0], y = a[1], z = a[2];
	var w = m[3] * x + m[7] * y + m[11] * z + m[15];
	w = w || 1;
	out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
	out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
	out[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
	return out;
}
/**
* Transforms the vec3 with a mat3.
*
* @param {vec3} out the receiving vector
* @param {ReadonlyVec3} a the vector to transform
* @param {ReadonlyMat3} m the 3x3 matrix to transform with
* @returns {vec3} out
*/
function transformMat3(out, a, m) {
	var x = a[0], y = a[1], z = a[2];
	out[0] = x * m[0] + y * m[3] + z * m[6];
	out[1] = x * m[1] + y * m[4] + z * m[7];
	out[2] = x * m[2] + y * m[5] + z * m[8];
	return out;
}
/**
* Alias for {@link vec3.multiply}
* @function
*/
var mul$1 = multiply$1;
(function() {
	var vec = create$1();
	return function(a, stride, offset, count, fn, arg) {
		var i, l;
		if (!stride) stride = 3;
		if (!offset) offset = 0;
		if (count) l = Math.min(count * stride + offset, a.length);
		else l = a.length;
		for (i = offset; i < l; i += stride) {
			vec[0] = a[i];
			vec[1] = a[i + 1];
			vec[2] = a[i + 2];
			fn(vec, vec, arg);
			a[i] = vec[0];
			a[i + 1] = vec[1];
			a[i + 2] = vec[2];
		}
		return a;
	};
})();
//#endregion
//#region src/weld.ts
/**
* CONTRIBUTOR NOTES
*
* Ideally a weld() implementation should be fast, robust, and tunable. The
* writeup below tracks my attempts to solve for these constraints.
*
* (Approach #1) Follow the mergeVertices() implementation of three.js,
* hashing vertices with a string concatenation of all vertex attributes.
* The approach does not allow per-attribute tolerance in local units.
*
* (Approach #2) Sort points along the X axis, then make cheaper
* searches up/down the sorted list for merge candidates. While this allows
* simpler comparison based on specified tolerance, it's much slower, even
* for cases where choice of the X vs. Y or Z axes is reasonable.
*
* (Approach #3) Attempted a Delaunay triangulation in three dimensions,
* expecting it would be an n * log(n) algorithm, but the only implementation
* I found (with delaunay-triangulate) appeared to be much slower than that,
* and was notably slower than the sort-based approach, just building the
* Delaunay triangulation alone.
*
* (Approach #4) Hybrid of (1) and (2), assigning vertices to a spatial
* grid, then searching the local neighborhood (27 cells) for weld candidates.
*
* (Approach #5) Based on Meshoptimizer's implementation, when tolerance=0
* use a hashtable to find bitwise-equal vertices quickly. Vastly faster than
* previous approaches, but without tolerance options.
*
* RESULTS: For the "Lovecraftian" sample model linked below, after joining,
* a primitive with 873,000 vertices can be welded down to 230,000 vertices.
* https://sketchfab.com/3d-models/sculpt-january-day-19-lovecraftian-34ad2501108e4fceb9394f5b816b9f42
*
* - (1) Not tested, but prior results suggest not robust enough.
* - (2) 30s
* - (3) 660s
* - (4) 5s exhaustive, 1.5s non-exhaustive
* - (5) 0.2s
*
* As of April 2024, the lossy weld was removed, leaving only approach #5. An
* upcoming Meshoptimizer release will include a simplifyWithAttributes
* function allowing simplification with weighted consideration of vertex
* attributes, which I hope to support. With that, weld() may remain faster,
* simpler, and more maintainable.
*/
const NAME$25 = "weld";
const WELD_DEFAULTS = { overwrite: true };
/**
* Welds {@link Primitive Primitives}, merging bitwise identical vertices. When
* merged and indexed, data is shared more efficiently between vertices. File size
* can be reduced, and the GPU uses the vertex cache more efficiently.
*
* Example:
*
* ```javascript
* import { weld, getSceneVertexCount, VertexCountMethod } from '@gltf-transform/functions';
*
* const scene = document.getDefaultScene();
* const srcVertexCount = getSceneVertexCount(scene, VertexCountMethod.UPLOAD);
* await document.transform(weld());
* const dstVertexCount = getSceneVertexCount(scene, VertexCountMethod.UPLOAD);
* ```
*
* @category Transforms
*/
function weld(_options = WELD_DEFAULTS) {
	const options = assignDefaults(WELD_DEFAULTS, _options);
	return createTransform(NAME$25, async (document) => {
		const logger = document.getLogger();
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("weld: Missing support for KHR_mesh_primitive_restart.");
		for (const mesh of document.getRoot().listMeshes()) {
			for (const prim of mesh.listPrimitives()) {
				weldPrimitive(prim, options);
				if (getPrimitiveVertexCount(prim, "render") === 0) deepDisposePrimitive(prim);
			}
			if (mesh.listPrimitives().length === 0) mesh.dispose();
		}
		logger.debug(`${NAME$25}: Complete.`);
	});
}
/**
* Welds a {@link Primitive}, merging bitwise identical vertices. When merged
* and indexed, data is shared more efficiently between vertices. File size can
* be reduced, and the GPU uses the vertex cache more efficiently.
*
* Example:
*
* ```javascript
* import { weldPrimitive, getMeshVertexCount, VertexCountMethod } from '@gltf-transform/functions';
*
* const mesh = document.getRoot().listMeshes()
* 	.find((mesh) => mesh.getName() === 'Gizmo');
*
* const srcVertexCount = getMeshVertexCount(mesh, VertexCountMethod.UPLOAD);
*
* for (const prim of mesh.listPrimitives()) {
*   weldPrimitive(prim);
* }
*
* const dstVertexCount = getMeshVertexCount(mesh, VertexCountMethod.UPLOAD);
* ```
*/
function weldPrimitive(prim, _options = WELD_DEFAULTS) {
	const graph = prim.getGraph();
	const logger = Document.fromGraph(graph).getLogger();
	const options = {
		...WELD_DEFAULTS,
		..._options
	};
	if (prim.getIndices() && !options.overwrite) return;
	if (prim.getMode() === Primitive.Mode.POINTS) return;
	const srcVertexCount = prim.getAttribute("POSITION").getCount();
	const srcIndices = prim.getIndices();
	const srcIndicesArray = srcIndices?.getArray();
	const srcIndicesCount = srcIndices ? srcIndices.getCount() : srcVertexCount;
	const stream = new VertexStream(prim);
	const tableSize = ceilPowerOfTwo$1(srcVertexCount + srcVertexCount / 4);
	const table = new Uint32Array(tableSize).fill(EMPTY_U32$1);
	const writeMap = new Uint32Array(srcVertexCount).fill(EMPTY_U32$1);
	let dstVertexCount = 0;
	for (let i = 0; i < srcIndicesCount; i++) {
		const srcIndex = srcIndicesArray ? srcIndicesArray[i] : i;
		if (writeMap[srcIndex] !== EMPTY_U32$1) continue;
		const hashIndex = hashLookup(table, tableSize, stream, srcIndex, EMPTY_U32$1);
		const dstIndex = table[hashIndex];
		if (dstIndex === EMPTY_U32$1) {
			table[hashIndex] = srcIndex;
			writeMap[srcIndex] = dstVertexCount++;
		} else writeMap[srcIndex] = writeMap[dstIndex];
	}
	logger.debug(`${NAME$25}: ${formatDeltaOp(srcVertexCount, dstVertexCount)} vertices.`);
	compactPrimitive(prim, writeMap, dstVertexCount);
}
//#endregion
//#region src/transform-primitive.ts
const { FLOAT } = Accessor.ComponentType;
/**
* Applies a transform matrix to a {@link Primitive}.
*
* All vertex attributes on the Primitive and its
* {@link PrimitiveTarget PrimitiveTargets} are modified in place. If vertex
* streams are shared with other Primitives, and overwriting the shared vertex
* attributes is not desired, use {@link compactPrimitive} to pre-process
* the Primitive or call {@link transformMesh} instead.
*
* Example:
*
* ```javascript
* import { fromTranslation } from 'gl-matrix/mat4';
* import { transformPrimitive } from '@gltf-transform/functions';
*
* // offset vertices, y += 10.
* transformPrimitive(prim, fromTranslation([], [0, 10, 0]));
* ```
*
* @param prim
* @param matrix
*/
function transformPrimitive(prim, matrix) {
	const position = prim.getAttribute("POSITION");
	if (position) applyMatrix(matrix, position);
	const normal = prim.getAttribute("NORMAL");
	if (normal) applyNormalMatrix(matrix, normal);
	const tangent = prim.getAttribute("TANGENT");
	if (tangent) applyTangentMatrix(matrix, tangent);
	for (const target of prim.listTargets()) {
		const position = target.getAttribute("POSITION");
		if (position) applyMatrix(matrix, position);
		const normal = target.getAttribute("NORMAL");
		if (normal) applyNormalMatrix(matrix, normal);
		const tangent = target.getAttribute("TANGENT");
		if (tangent) applyTangentMatrix(matrix, tangent);
	}
	if (determinant(matrix) < 0) reversePrimitiveWindingOrder(prim);
}
function applyMatrix(matrix, attribute) {
	const componentType = attribute.getComponentType();
	const normalized = attribute.getNormalized();
	const srcArray = attribute.getArray();
	const dstArray = componentType === FLOAT ? srcArray : new Float32Array(srcArray.length);
	const vector = create$1();
	for (let i = 0, il = attribute.getCount(); i < il; i++) {
		if (normalized) {
			vector[0] = MathUtils.decodeNormalizedInt(srcArray[i * 3], componentType);
			vector[1] = MathUtils.decodeNormalizedInt(srcArray[i * 3 + 1], componentType);
			vector[2] = MathUtils.decodeNormalizedInt(srcArray[i * 3 + 2], componentType);
		} else {
			vector[0] = srcArray[i * 3];
			vector[1] = srcArray[i * 3 + 1];
			vector[2] = srcArray[i * 3 + 2];
		}
		transformMat4(vector, vector, matrix);
		dstArray[i * 3] = vector[0];
		dstArray[i * 3 + 1] = vector[1];
		dstArray[i * 3 + 2] = vector[2];
	}
	attribute.setArray(dstArray).setNormalized(false);
}
function applyNormalMatrix(matrix, attribute) {
	const array = attribute.getArray();
	const normalized = attribute.getNormalized();
	const componentType = attribute.getComponentType();
	const normalMatrix = create$2();
	fromMat4(normalMatrix, matrix);
	invert(normalMatrix, normalMatrix);
	transpose(normalMatrix, normalMatrix);
	const vector = create$1();
	for (let i = 0, il = attribute.getCount(); i < il; i++) {
		if (normalized) {
			vector[0] = MathUtils.decodeNormalizedInt(array[i * 3], componentType);
			vector[1] = MathUtils.decodeNormalizedInt(array[i * 3 + 1], componentType);
			vector[2] = MathUtils.decodeNormalizedInt(array[i * 3 + 2], componentType);
		} else {
			vector[0] = array[i * 3];
			vector[1] = array[i * 3 + 1];
			vector[2] = array[i * 3 + 2];
		}
		transformMat3(vector, vector, normalMatrix);
		normalize(vector, vector);
		if (normalized) {
			array[i * 3] = MathUtils.decodeNormalizedInt(vector[0], componentType);
			array[i * 3 + 1] = MathUtils.decodeNormalizedInt(vector[1], componentType);
			array[i * 3 + 2] = MathUtils.decodeNormalizedInt(vector[2], componentType);
		} else {
			array[i * 3] = vector[0];
			array[i * 3 + 1] = vector[1];
			array[i * 3 + 2] = vector[2];
		}
	}
}
function applyTangentMatrix(matrix, attribute) {
	const array = attribute.getArray();
	const normalized = attribute.getNormalized();
	const componentType = attribute.getComponentType();
	const v3 = create$1();
	for (let i = 0, il = attribute.getCount(); i < il; i++) {
		if (normalized) {
			v3[0] = MathUtils.decodeNormalizedInt(array[i * 4], componentType);
			v3[1] = MathUtils.decodeNormalizedInt(array[i * 4 + 1], componentType);
			v3[2] = MathUtils.decodeNormalizedInt(array[i * 4 + 2], componentType);
		} else {
			v3[0] = array[i * 4];
			v3[1] = array[i * 4 + 1];
			v3[2] = array[i * 4 + 2];
		}
		v3[0] = matrix[0] * v3[0] + matrix[4] * v3[1] + matrix[8] * v3[2];
		v3[1] = matrix[1] * v3[0] + matrix[5] * v3[1] + matrix[9] * v3[2];
		v3[2] = matrix[2] * v3[0] + matrix[6] * v3[1] + matrix[10] * v3[2];
		normalize(v3, v3);
		if (normalized) {
			array[i * 4] = MathUtils.decodeNormalizedInt(v3[0], componentType);
			array[i * 4 + 1] = MathUtils.decodeNormalizedInt(v3[1], componentType);
			array[i * 4 + 2] = MathUtils.decodeNormalizedInt(v3[2], componentType);
		} else {
			array[i * 4] = v3[0];
			array[i * 4 + 1] = v3[1];
			array[i * 4 + 2] = v3[2];
		}
	}
}
function reversePrimitiveWindingOrder(prim) {
	if (prim.getMode() !== Primitive.Mode.TRIANGLES) return;
	if (!prim.getIndices()) weldPrimitive(prim);
	const indices = prim.getIndices();
	for (let i = 0, il = indices.getCount(); i < il; i += 3) {
		const a = indices.getScalar(i);
		const c = indices.getScalar(i + 2);
		indices.setScalar(i, c);
		indices.setScalar(i + 2, a);
	}
}
//#endregion
//#region src/transform-mesh.ts
/**
* Applies a transform matrix to every {@link Primitive} in the given {@link Mesh}.
*
* For every Primitive in the Mesh, the operation first applies
* {@link compactPrimitive} to isolate vertex streams, then calls
* {@link transformPrimitive}. Transformed Mesh will no longer share vertex
* attributes with any other Meshes — attributes are cloned before
* transformation.
*
* Example:
*
* ```javascript
* import { fromTranslation } from 'gl-matrix/mat4';
* import { transformMesh } from '@gltf-transform/functions';
*
* // offset vertices, y += 10.
* transformMesh(mesh, fromTranslation([], [0, 10, 0]));
* ```
*
* @param mesh
* @param matrix
*/
function transformMesh(mesh, matrix) {
	for (const srcPrim of mesh.listPrimitives()) {
		const dstPrim = shallowClonePrimitive(srcPrim, mesh);
		if (srcPrim !== dstPrim) mesh.removePrimitive(srcPrim).addPrimitive(dstPrim);
	}
	for (const prim of mesh.listPrimitives()) {
		compactPrimitive(prim);
		transformPrimitive(prim, matrix);
	}
}
/**
* Conditionally clones a {@link Primitive} and its
* {@link PrimitiveTarget PrimitiveTargets}, if any are shared with other
* parents. If nothing is shared, nothing is cloned. Accessors and materials
* are not cloned.
*
* @hidden
* @internal
*/
function shallowClonePrimitive(prim, parentMesh) {
	if (prim.listParents().some((parent) => parent instanceof Mesh && parent !== parentMesh)) prim = prim.clone();
	for (const target of prim.listTargets()) if (target.listParents().some((parent) => parent instanceof Primitive && parent !== prim)) prim.removeTarget(target).addTarget(target.clone());
	return prim;
}
//#endregion
//#region src/clear-node-transform.ts
const IDENTITY = [
	1,
	0,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	0,
	1,
	0,
	0,
	0,
	0,
	1
];
/**
* Clears local transform of the {@link Node}, applying the transform to children and meshes.
*
* - Applies transform to children
* - Applies transform to {@link Mesh mesh}
* - Resets {@link Light lights}, {@link Camera cameras}, and other attachments to the origin
*
* Example:
*
* ```typescript
* import { clearNodeTransform } from '@gltf-transform/functions';
*
* node.getTranslation(); // → [ 5, 0, 0 ]
* node.getMesh(); // → vertex data centered at origin
*
* clearNodeTransform(node);
*
* node.getTranslation(); // → [ 0, 0, 0 ]
* node.getMesh(); // → vertex data centered at [ 5, 0, 0 ]
* ```
*
* To clear _all_ transforms of a Node, first clear its inherited transforms with
* {@link clearNodeParent}, then clear the local transform with {@link clearNodeTransform}.
*/
function clearNodeTransform(node) {
	const mesh = node.getMesh();
	const localMatrix = node.getMatrix();
	if (mesh && !MathUtils.eq(localMatrix, IDENTITY)) transformMesh(mesh, localMatrix);
	for (const child of node.listChildren()) {
		const matrix = child.getMatrix();
		multiply$2(matrix, matrix, localMatrix);
		child.setMatrix(matrix);
	}
	return node.setMatrix(IDENTITY);
}
//#endregion
//#region src/convert-primitive-mode.ts
const { LINES: LINES$1, LINE_STRIP: LINE_STRIP$1, LINE_LOOP: LINE_LOOP$1, TRIANGLES: TRIANGLES$1, TRIANGLE_STRIP: TRIANGLE_STRIP$1, TRIANGLE_FAN: TRIANGLE_FAN$1 } = Primitive.Mode;
/**
* Converts a LINE_STRIP or LINE_LOOP {@link Primitive} to LINES, which is
* more widely supported. Any other topology given as input (points or
* triangles) will throw an error.
*
* Example:
*
* ```javascript
* import { convertPrimitiveToLines } from '@gltf-transform/functions';
*
* console.log(prim.getMode()); // 2 (LINE_LOOP)
* convertPrimitiveToLines(prim);
* console.log(prim.getMode()); // 1 (LINES)
* ```
*/
function convertPrimitiveToLines(prim) {
	const graph = prim.getGraph();
	const document = Document.fromGraph(graph);
	if (!prim.getIndices()) weldPrimitive(prim);
	const srcIndices = prim.getIndices();
	const srcIndicesArray = srcIndices.getArray();
	const dstGLPrimitiveCount = getGLPrimitiveCount(prim);
	const IndicesArray = ComponentTypeToTypedArray[srcIndices.getComponentType()];
	const dstIndicesArray = new IndicesArray(dstGLPrimitiveCount * 2);
	const srcMode = prim.getMode();
	if (srcMode === LINE_STRIP$1) for (let i = 0; i < dstGLPrimitiveCount; i++) {
		dstIndicesArray[i * 2] = srcIndicesArray[i];
		dstIndicesArray[i * 2 + 1] = srcIndicesArray[i + 1];
	}
	else if (srcMode === LINE_LOOP$1) for (let i = 0; i < dstGLPrimitiveCount; i++) if (i < dstGLPrimitiveCount - 1) {
		dstIndicesArray[i * 2] = srcIndicesArray[i];
		dstIndicesArray[i * 2 + 1] = srcIndicesArray[i + 1];
	} else {
		dstIndicesArray[i * 2] = srcIndicesArray[i];
		dstIndicesArray[i * 2 + 1] = srcIndicesArray[0];
	}
	else throw new Error("Only LINE_STRIP and LINE_LOOP may be converted to LINES.");
	prim.setMode(LINES$1);
	const root = document.getRoot();
	if (srcIndices.listParents().some((parent) => parent !== root && parent !== prim)) prim.setIndices(shallowCloneAccessor(document, srcIndices).setArray(dstIndicesArray));
	else srcIndices.setArray(dstIndicesArray);
}
/**
* Converts a TRIANGLE_STRIP or TRIANGLE_LOOP {@link Primitive} to TRIANGLES,
* which is more widely supported. Any other topology given as input (points or
* lines) will throw an error.
*
* Example:
*
* ```javascript
* import { convertPrimitiveToTriangles } from '@gltf-transform/functions';
*
* console.log(prim.getMode()); // 5 (TRIANGLE_STRIP)
* convertPrimitiveToTriangles(prim);
* console.log(prim.getMode()); // 4 (TRIANGLES)
* ```
*/
function convertPrimitiveToTriangles(prim) {
	const graph = prim.getGraph();
	const document = Document.fromGraph(graph);
	if (!prim.getIndices()) weldPrimitive(prim);
	const srcIndices = prim.getIndices();
	const srcIndicesArray = srcIndices.getArray();
	const dstGLPrimitiveCount = getGLPrimitiveCount(prim);
	const IndicesArray = ComponentTypeToTypedArray[srcIndices.getComponentType()];
	const dstIndicesArray = new IndicesArray(dstGLPrimitiveCount * 3);
	const srcMode = prim.getMode();
	if (srcMode === TRIANGLE_STRIP$1) for (let i = 0, il = srcIndicesArray.length; i < il - 2; i++) if (i % 2) {
		dstIndicesArray[i * 3] = srcIndicesArray[i + 1];
		dstIndicesArray[i * 3 + 1] = srcIndicesArray[i];
		dstIndicesArray[i * 3 + 2] = srcIndicesArray[i + 2];
	} else {
		dstIndicesArray[i * 3] = srcIndicesArray[i];
		dstIndicesArray[i * 3 + 1] = srcIndicesArray[i + 1];
		dstIndicesArray[i * 3 + 2] = srcIndicesArray[i + 2];
	}
	else if (srcMode === TRIANGLE_FAN$1) for (let i = 0; i < dstGLPrimitiveCount; i++) {
		dstIndicesArray[i * 3] = srcIndicesArray[0];
		dstIndicesArray[i * 3 + 1] = srcIndicesArray[i + 1];
		dstIndicesArray[i * 3 + 2] = srcIndicesArray[i + 2];
	}
	else throw new Error("Only TRIANGLE_STRIP and TRIANGLE_FAN may be converted to TRIANGLES.");
	prim.setMode(TRIANGLES$1);
	const root = document.getRoot();
	if (srcIndices.listParents().some((parent) => parent !== root && parent !== prim)) prim.setIndices(shallowCloneAccessor(document, srcIndices).setArray(dstIndicesArray));
	else srcIndices.setArray(dstIndicesArray);
}
//#endregion
//#region src/dedup.ts
const NAME$24 = "dedup";
const DEDUP_DEFAULTS = {
	keepUniqueNames: false,
	propertyTypes: [
		PropertyType.ACCESSOR,
		PropertyType.MESH,
		PropertyType.TEXTURE,
		PropertyType.MATERIAL,
		PropertyType.SKIN
	]
};
/**
* Removes duplicate {@link Accessor}, {@link Mesh}, {@link Texture}, and {@link Material}
* properties. Partially based on a
* [gist by mattdesl](https://gist.github.com/mattdesl/aea40285e2d73916b6b9101b36d84da8). Only
* accessors in mesh primitives, morph targets, and animation samplers are processed.
*
* Example:
*
* ```ts
* document.getRoot().listMeshes(); // → [Mesh, Mesh, Mesh]
*
* await document.transform(dedup({propertyTypes: [PropertyType.MESH]}));
*
* document.getRoot().listMeshes(); // → [Mesh]
* ```
*
* @category Transforms
*/
function dedup(_options = DEDUP_DEFAULTS) {
	const options = assignDefaults(DEDUP_DEFAULTS, _options);
	const propertyTypes = new Set(options.propertyTypes);
	for (const propertyType of options.propertyTypes) if (!DEDUP_DEFAULTS.propertyTypes.includes(propertyType)) throw new Error(`${NAME$24}: Unsupported deduplication on type "${propertyType}".`);
	return createTransform(NAME$24, (document) => {
		const logger = document.getLogger();
		if (propertyTypes.has(PropertyType.ACCESSOR)) dedupAccessors(document);
		if (propertyTypes.has(PropertyType.TEXTURE)) dedupImages(document, options);
		if (propertyTypes.has(PropertyType.MATERIAL)) dedupMaterials(document, options);
		if (propertyTypes.has(PropertyType.MESH)) dedupMeshes(document, options);
		if (propertyTypes.has(PropertyType.SKIN)) dedupSkins(document, options);
		logger.debug(`${NAME$24}: Complete.`);
	});
}
function dedupAccessors(document) {
	const logger = document.getLogger();
	const indicesMap = /* @__PURE__ */ new Map();
	const attributeMap = /* @__PURE__ */ new Map();
	const inputMap = /* @__PURE__ */ new Map();
	const outputMap = /* @__PURE__ */ new Map();
	const meshes = document.getRoot().listMeshes();
	meshes.forEach((mesh) => {
		mesh.listPrimitives().forEach((primitive) => {
			primitive.listAttributes().forEach((accessor) => hashAccessor(accessor, attributeMap));
			hashAccessor(primitive.getIndices(), indicesMap);
		});
	});
	for (const animation of document.getRoot().listAnimations()) for (const sampler of animation.listSamplers()) {
		hashAccessor(sampler.getInput(), inputMap);
		hashAccessor(sampler.getOutput(), outputMap);
	}
	function hashAccessor(accessor, group) {
		if (!accessor) return;
		const hash = [
			accessor.getCount(),
			accessor.getType(),
			accessor.getComponentType(),
			accessor.getNormalized(),
			accessor.getSparse()
		].join(":");
		let hashSet = group.get(hash);
		if (!hashSet) group.set(hash, hashSet = /* @__PURE__ */ new Set());
		hashSet.add(accessor);
	}
	function detectDuplicates(accessors, duplicates) {
		for (let i = 0; i < accessors.length; i++) {
			const a = accessors[i];
			const aData = BufferUtils.toView(a.getArray());
			if (duplicates.has(a)) continue;
			for (let j = i + 1; j < accessors.length; j++) {
				const b = accessors[j];
				if (duplicates.has(b)) continue;
				if (BufferUtils.equals(aData, BufferUtils.toView(b.getArray()))) duplicates.set(b, a);
			}
		}
	}
	let total = 0;
	const duplicates = /* @__PURE__ */ new Map();
	for (const group of [
		attributeMap,
		indicesMap,
		inputMap,
		outputMap
	]) for (const hashGroup of group.values()) {
		total += hashGroup.size;
		detectDuplicates(Array.from(hashGroup), duplicates);
	}
	logger.debug(`${NAME$24}: Merged ${duplicates.size} of ${total} accessors.`);
	meshes.forEach((mesh) => {
		mesh.listPrimitives().forEach((primitive) => {
			primitive.listAttributes().forEach((accessor) => {
				if (duplicates.has(accessor)) primitive.swap(accessor, duplicates.get(accessor));
			});
			const indices = primitive.getIndices();
			if (indices && duplicates.has(indices)) primitive.swap(indices, duplicates.get(indices));
		});
	});
	for (const animation of document.getRoot().listAnimations()) for (const sampler of animation.listSamplers()) {
		const input = sampler.getInput();
		const output = sampler.getOutput();
		if (input && duplicates.has(input)) sampler.swap(input, duplicates.get(input));
		if (output && duplicates.has(output)) sampler.swap(output, duplicates.get(output));
	}
	Array.from(duplicates.keys()).forEach((accessor) => accessor.dispose());
}
function dedupMeshes(document, options) {
	const logger = document.getLogger();
	const root = document.getRoot();
	const refs = /* @__PURE__ */ new Map();
	root.listAccessors().forEach((accessor, index) => refs.set(accessor, index));
	root.listMaterials().forEach((material, index) => refs.set(material, index));
	const numMeshes = root.listMeshes().length;
	const uniqueMeshes = /* @__PURE__ */ new Map();
	for (const src of root.listMeshes()) {
		const srcKeyItems = [];
		for (const prim of src.listPrimitives()) srcKeyItems.push(createPrimitiveKey(prim, refs));
		let meshKey = "";
		if (options.keepUniqueNames) meshKey += src.getName() + ";";
		meshKey += srcKeyItems.join(";");
		if (uniqueMeshes.has(meshKey)) {
			const targetMesh = uniqueMeshes.get(meshKey);
			src.listParents().forEach((parent) => {
				if (parent.propertyType !== PropertyType.ROOT) parent.swap(src, targetMesh);
			});
			src.dispose();
		} else uniqueMeshes.set(meshKey, src);
	}
	logger.debug(`${NAME$24}: Merged ${numMeshes - uniqueMeshes.size} of ${numMeshes} meshes.`);
}
function dedupImages(document, options) {
	const logger = document.getLogger();
	const root = document.getRoot();
	const textures = root.listTextures();
	const duplicates = /* @__PURE__ */ new Map();
	for (let i = 0; i < textures.length; i++) {
		const a = textures[i];
		const aData = a.getImage();
		if (duplicates.has(a)) continue;
		for (let j = i + 1; j < textures.length; j++) {
			const b = textures[j];
			const bData = b.getImage();
			if (duplicates.has(b)) continue;
			if (a.getMimeType() !== b.getMimeType()) continue;
			if (options.keepUniqueNames && a.getName() !== b.getName()) continue;
			const aSize = a.getSize();
			const bSize = b.getSize();
			if (!aSize || !bSize) continue;
			if (aSize[0] !== bSize[0]) continue;
			if (aSize[1] !== bSize[1]) continue;
			if (!aData || !bData) continue;
			if (BufferUtils.equals(aData, bData)) duplicates.set(b, a);
		}
	}
	logger.debug(`${NAME$24}: Merged ${duplicates.size} of ${root.listTextures().length} textures.`);
	Array.from(duplicates.entries()).forEach(([src, dst]) => {
		src.listParents().forEach((property) => {
			if (!(property instanceof Root)) property.swap(src, dst);
		});
		src.dispose();
	});
}
function dedupMaterials(document, options) {
	const logger = document.getLogger();
	const materials = document.getRoot().listMaterials();
	const duplicates = /* @__PURE__ */ new Map();
	const modifierCache = /* @__PURE__ */ new Map();
	const skip = /* @__PURE__ */ new Set();
	if (!options.keepUniqueNames) skip.add("name");
	for (let i = 0; i < materials.length; i++) {
		const a = materials[i];
		if (duplicates.has(a)) continue;
		if (hasModifier(a, modifierCache)) continue;
		for (let j = i + 1; j < materials.length; j++) {
			const b = materials[j];
			if (duplicates.has(b)) continue;
			if (hasModifier(b, modifierCache)) continue;
			if (a.equals(b, skip)) duplicates.set(b, a);
		}
	}
	logger.debug(`${NAME$24}: Merged ${duplicates.size} of ${materials.length} materials.`);
	Array.from(duplicates.entries()).forEach(([src, dst]) => {
		src.listParents().forEach((property) => {
			if (!(property instanceof Root)) property.swap(src, dst);
		});
		src.dispose();
	});
}
function dedupSkins(document, options) {
	const logger = document.getLogger();
	const skins = document.getRoot().listSkins();
	const duplicates = /* @__PURE__ */ new Map();
	const skip = /* @__PURE__ */ new Set(["joints"]);
	if (!options.keepUniqueNames) skip.add("name");
	for (let i = 0; i < skins.length; i++) {
		const a = skins[i];
		if (duplicates.has(a)) continue;
		for (let j = i + 1; j < skins.length; j++) {
			const b = skins[j];
			if (duplicates.has(b)) continue;
			if (a.equals(b, skip) && shallowEqualsArray(a.listJoints(), b.listJoints())) duplicates.set(b, a);
		}
	}
	logger.debug(`${NAME$24}: Merged ${duplicates.size} of ${skins.length} skins.`);
	Array.from(duplicates.entries()).forEach(([src, dst]) => {
		src.listParents().forEach((property) => {
			if (!(property instanceof Root)) property.swap(src, dst);
		});
		src.dispose();
	});
}
/** Generates a key unique to the content of a primitive or target. */
function createPrimitiveKey(prim, refs) {
	const primKeyItems = [];
	for (const semantic of prim.listSemantics()) {
		const attribute = prim.getAttribute(semantic);
		primKeyItems.push(semantic + ":" + refs.get(attribute));
	}
	if (prim instanceof Primitive) {
		const indices = prim.getIndices();
		if (indices) primKeyItems.push("indices:" + refs.get(indices));
		const material = prim.getMaterial();
		if (material) primKeyItems.push("material:" + refs.get(material));
		primKeyItems.push("mode:" + prim.getMode());
		for (const target of prim.listTargets()) primKeyItems.push("target:" + createPrimitiveKey(target, refs));
	}
	return primKeyItems.join(",");
}
/**
* Detects dependencies modified by a parent reference, to conservatively prevent merging. When
* implementing extensions like KHR_animation_pointer, the 'modifyChild' attribute should be added
* to graph edges connecting the animation channel to the animated target property.
*
* NOTICE: Implementation is conservative, and could prevent merging two materials sharing the
* same animated "Clearcoat" ExtensionProperty. While that scenario is possible for an in-memory
* glTF Transform graph, valid glTF input files do not have that risk.
*/
function hasModifier(prop, cache) {
	if (cache.has(prop)) return cache.get(prop);
	const graph = prop.getGraph();
	const visitedNodes = /* @__PURE__ */ new Set();
	const edgeQueue = graph.listParentEdges(prop);
	while (edgeQueue.length > 0) {
		const edge = edgeQueue.pop();
		if (edge.getAttributes().modifyChild === true) {
			cache.set(prop, true);
			return true;
		}
		const child = edge.getChild();
		if (visitedNodes.has(child)) continue;
		for (const childEdge of graph.listChildEdges(child)) edgeQueue.push(childEdge);
	}
	cache.set(prop, false);
	return false;
}
//#endregion
//#region src/dequantize.ts
const NAME$23 = "dequantize";
const DEQUANTIZE_DEFAULTS = { pattern: /^((?!JOINTS_).)*$/ };
/**
* Dequantize {@link Primitive Primitives}, removing {@link KHRMeshQuantization `KHR_mesh_quantization`}
* if present. Dequantization will increase the size of the mesh on disk and in memory, but may be
* necessary for compatibility with applications that don't support quantization.
*
* Example:
*
* ```javascript
* import { dequantizePrimitive } from '@gltf-transform/functions';
*
* await document.transform(dequantize());
* ```
*
* @category Transforms
*/
function dequantize(_options = DEQUANTIZE_DEFAULTS) {
	const options = assignDefaults(DEQUANTIZE_DEFAULTS, _options);
	return createTransform(NAME$23, (document) => {
		const logger = document.getLogger();
		for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) dequantizePrimitive(prim, options);
		document.disposeExtension("KHR_mesh_quantization");
		logger.debug(`${NAME$23}: Complete.`);
	});
}
/**
* Dequantize a single {@link Primitive}, converting all vertex attributes to float32. Dequantization
* will increase the size of the mesh on disk and in memory, but may be necessary for compatibility
* with applications that don't support quantization.
*
* Example:
*
* ```javascript
* import { dequantizePrimitive } from '@gltf-transform/functions';
*
* const mesh = document.getRoot().listMeshes().find((mesh) => mesh.getName() === 'MyMesh');
*
* for (const prim of mesh.listPrimitives()) {
* 	dequantizePrimitive(prim);
* }
* ```
*/
function dequantizePrimitive(prim, _options = DEQUANTIZE_DEFAULTS) {
	const options = assignDefaults(DEQUANTIZE_DEFAULTS, _options);
	for (const semantic of prim.listSemantics()) if (options.pattern.test(semantic)) dequantizeAttribute(prim.getAttribute(semantic));
	for (const target of prim.listTargets()) for (const semantic of target.listSemantics()) if (options.pattern.test(semantic)) dequantizeAttribute(target.getAttribute(semantic));
}
function dequantizeAttribute(attribute) {
	const srcArray = attribute.getArray();
	if (!srcArray) return;
	const dstArray = dequantizeAttributeArray(srcArray, attribute.getComponentType(), attribute.getNormalized());
	attribute.setArray(dstArray).setNormalized(false);
}
function dequantizeAttributeArray(srcArray, componentType, normalized) {
	const dstArray = new Float32Array(srcArray.length);
	for (let i = 0, il = srcArray.length; i < il; i++) if (normalized) dstArray[i] = MathUtils.decodeNormalizedInt(srcArray[i], componentType);
	else dstArray[i] = srcArray[i];
	return dstArray;
}
//#endregion
//#region src/document-utils.ts
const { TEXTURE_INFO, ROOT: ROOT$1 } = PropertyType;
const NO_TRANSFER_TYPES = /* @__PURE__ */ new Set([TEXTURE_INFO, ROOT$1]);
/**
* Clones source {@link Document}, copying all properties and extensions within
* it. Source document remains unchanged, and the two may be modified
* independently after cloning.
*
* Example:
*
* ```javascript
*	import { cloneDocument } from '@gltf-transform/functions';
*
*	const targetDocument = cloneDocument(sourceDocument);
* ```
*/
function cloneDocument(source) {
	const target = new Document().setLogger(source.getLogger());
	const resolve = createDefaultPropertyResolver(target, source);
	mergeDocuments(target, source, resolve);
	target.getRoot().copy(source.getRoot(), resolve);
	return target;
}
/**
* Merges contents of source {@link Document} into target Document, without
* modifying the source. Any extensions missing from the target will be added
* {@link Scene Scenes} and {@link Buffer Buffers} are not combined —
* the target Document may contain multiple Scenes and Buffers after this
* operation. These may be cleaned up manually (see {@link unpartition}),
* or document contents may be merged more granularly using
* {@link copyToDocument}.
*
* Example:
*
* ```javascript
*	import { mergeDocuments, unpartition } from '@gltf-transform/functions';
*
*	// Merge contents of sourceDocument into targetDocument.
*	mergeDocuments(targetDocument, sourceDocument);
*
*	// (Optional) Remove all but one Buffer from the target Document.
*	await targetDocument.transform(unpartition());
* ```
*
* To merge several Scenes into one:
*
* ```javascript
* import { mergeDocuments } from '@gltf-transform/functions';
*
* const map = mergeDocuments(targetDocument, sourceDocument);
*
* // Find original Scene.
* const sceneA = targetDocument.getRoot().listScenes()[0];
*
* // Find counterpart of the source Scene in the target Document.
* const sceneB = map.get(sourceDocument.getRoot().listScenes()[0]);
*
* // Create a Node, and append source Scene's direct children.
* const rootNode = targetDocument.createNode()
*		.setName('SceneB')
*		.setPosition([10, 0, 0]);
* for (const node of sceneB.listChildren()) {
*		rootNode.addChild(node);
* }
*
* // Append Node to original Scene, and dispose the empty Scene.
* sceneA.addChild(rootNode);
* sceneB.dispose();
* ```
*/
function mergeDocuments(target, source, resolve) {
	resolve ||= createDefaultPropertyResolver(target, source);
	for (const sourceExtension of source.getRoot().listExtensionsUsed()) {
		const targetExtension = target.createExtension(sourceExtension.constructor);
		if (sourceExtension.isRequired()) targetExtension.setRequired(true);
	}
	return _copyToDocument(target, source, listNonRootProperties(source), resolve);
}
/**
* Moves the specified {@link Property Properties} from the source
* {@link Document} to the target Document, and removes them from the source.
* Dependencies of the source properties will be copied into the
* target, but not removed from the source. Returns a Map from source
* properties to their counterparts in the target Document.
*
* Example:
*
* ```javascript
*	import { moveToDocument, prune } from '@gltf-transform/functions';
*
*	// Move all materials from sourceDocument to targetDocument.
*	const map = moveToDocument(targetDocument, sourceDocument, sourceDocument.listMaterials());
*
*	// Find the new counterpart of `sourceMaterial` in the target Document.
*	const targetMaterial = map.get(sourceMaterial);
*
*	// (Optional) Remove any resources (like Textures) that may now be unused
*	// in the source Document after their parent Materials have been moved.
*	await sourceDocument.transform(prune());
* ```
*
* Moving a {@link Mesh}, {@link Animation}, or another resource depending on
* a {@link Buffer} will create a copy of the source Buffer in the target
* Document. If the target Document should contain only one Buffer, call
* {@link unpartition} after moving properties.
*
* Repeated use of `moveToDocument` may create multiple copies of some
* resources, particularly shared dependencies like {@link Texture Textures} or
* {@link Accessor Accessors}. While duplicates can be cleaned up with
* {@link dedup}, it is also possible to prevent duplicates by creating and
* reusing the same resolver for all calls to `moveToDocument`:
*
* ```javascript
*	import { moveToDocument, createDefaultPropertyResolver } from '@gltf-transform/functions';
*
*	const resolve = createDefaultPropertyResolver(targetDocument, sourceDocument);
*
*	// Move materials individually, without creating duplicates of shared textures.
*	moveToDocument(targetDocument, sourceDocument, materialA, resolve);
*	moveToDocument(targetDocument, sourceDocument, materialB, resolve);
*	moveToDocument(targetDocument, sourceDocument, materialC, resolve);
* ```
*
* If the transferred properties include {@link ExtensionProperty ExtensionProperties},
* the associated {@link Extension Extensions} must be added to the target
* Document first:
*
* ```javascript
*	for (const sourceExtension of source.getRoot().listExtensionsUsed()) {
*		const targetExtension = target.createExtension(sourceExtension.constructor);
*		if (sourceExtension.isRequired()) targetExtension.setRequired(true);
*	}
* ```
*
* {@link Root} properties cannot be moved.
*
* {@link TextureInfo} properties cannot be given in the property list, but
* are handled automatically when moving a {@link Material}.
*
* To copy properties without removing them from the source Document, see
* {@link copyToDocument}.
*
* @experimental
*/
function moveToDocument(target, source, sourceProperties, resolve) {
	const targetProperties = copyToDocument(target, source, sourceProperties, resolve);
	for (const property of sourceProperties) property.dispose();
	return targetProperties;
}
/**
* Copies the specified {@link Property Properties} from the source
* {@link Document} to the target Document, leaving originals in the source.
* Dependencies of the source properties will also be copied into the
* target. Returns a Map from source properties to their counterparts in the
* target Document.
*
* Example:
*
* ```javascript
*	import { copyToDocument } from '@gltf-transform/functions';
*
*	// Copy all materials from sourceDocument to targetDocument.
*	const map = copyToDocument(targetDocument, sourceDocument, sourceDocument.listMaterials());
*
*	// Find the new counterpart of `sourceMaterial` in the target Document.
*	const targetMaterial = map.get(sourceMaterial);
* ```
*
* Copying a {@link Mesh}, {@link Animation}, or another resource depending on
* a {@link Buffer} will create a copy of the source Buffer in the target
* Document. If the target Document should contain only one Buffer, call
* {@link unpartition} after copying properties.
*
* Repeated use of `copyToDocument` may create multiple copies of some
* resources, particularly shared dependencies like {@link Texture Textures} or
* {@link Accessor Accessors}. While duplicates can be cleaned up with
* {@link dedup}, it is also possible to prevent duplicates by creating and
* reusing the same resolver for all calls to `copyToDocument`:
*
* ```javascript
*	import { copyToDocument, createDefaultPropertyResolver } from '@gltf-transform/functions';
*
*	const resolve = createDefaultPropertyResolver(targetDocument, sourceDocument);
*
*	// Copy materials individually, without creating duplicates of shared textures.
*	copyToDocument(targetDocument, sourceDocument, materialA, resolve);
*	copyToDocument(targetDocument, sourceDocument, materialB, resolve);
*	copyToDocument(targetDocument, sourceDocument, materialC, resolve);
* ```
*
* If the transferred properties include {@link ExtensionProperty ExtensionProperties},
* the associated {@link Extension Extensions} must be added to the target
* Document first:
*
* ```javascript
*	for (const sourceExtension of source.getRoot().listExtensionsUsed()) {
*		const targetExtension = target.createExtension(sourceExtension.constructor);
*		if (sourceExtension.isRequired()) targetExtension.setRequired(true);
*	}
* ```
*
* {@link Root} properties cannot be copied.
*
* {@link TextureInfo} properties cannot be given in the property list, but
* are handled automatically when copying a {@link Material}.
*
* To move properties to the target Document without leaving copies behind in
* the source Document, use {@link moveToDocument} or dispose the properties
* after copying.
*
* @experimental
*/
function copyToDocument(target, source, sourceProperties, resolve) {
	const sourcePropertyDependencies = /* @__PURE__ */ new Set();
	for (const property of sourceProperties) {
		if (NO_TRANSFER_TYPES.has(property.propertyType)) throw new Error(`Type "${property.propertyType}" cannot be transferred.`);
		listPropertyDependencies(property, sourcePropertyDependencies);
	}
	return _copyToDocument(target, source, Array.from(sourcePropertyDependencies), resolve);
}
/** @internal */
function _copyToDocument(target, source, sourceProperties, resolve) {
	resolve ||= createDefaultPropertyResolver(target, source);
	const propertyMap = /* @__PURE__ */ new Map();
	for (const sourceProp of sourceProperties) if (!propertyMap.has(sourceProp) && sourceProp.propertyType !== TEXTURE_INFO) propertyMap.set(sourceProp, resolve(sourceProp));
	for (const [sourceProp, targetProp] of propertyMap.entries()) targetProp.copy(sourceProp, resolve);
	return propertyMap;
}
/**
* Creates a default `resolve` implementation. May be used when moving
* properties between {@link Document Documents} with {@link mergeDocuments},
* {@link copyToDocument}, and {@link moveToDocument}. When the same resolver
* is passed to multiple invocations, these functions will reuse previously-
* transferred resources.
*
* @experimental
*/
function createDefaultPropertyResolver(target, source) {
	const propertyMap = /* @__PURE__ */ new Map([[source.getRoot(), target.getRoot()]]);
	return (sourceProp) => {
		if (sourceProp.propertyType === TEXTURE_INFO) return sourceProp;
		let targetProp = propertyMap.get(sourceProp);
		if (!targetProp) {
			const PropertyClass = sourceProp.constructor;
			targetProp = new PropertyClass(target.getGraph());
			propertyMap.set(sourceProp, targetProp);
		}
		return targetProp;
	};
}
/** @internal */
function listPropertyDependencies(parent, visited) {
	const graph = parent.getGraph();
	const queue = [parent];
	let next;
	while (next = queue.pop()) {
		visited.add(next);
		for (const child of graph.listChildren(next)) if (!visited.has(child)) queue.push(child);
	}
	return visited;
}
/** @internal */
function listNonRootProperties(document) {
	const visited = /* @__PURE__ */ new Set();
	for (const edge of document.getGraph().listEdges()) visited.add(edge.getChild());
	return Array.from(visited);
}
//#endregion
//#region src/draco.ts
const NAME$22 = "draco";
const DRACO_DEFAULTS = {
	method: "edgebreaker",
	encodeSpeed: 5,
	decodeSpeed: 5,
	quantizePosition: 14,
	quantizeNormal: 10,
	quantizeColor: 8,
	quantizeTexcoord: 12,
	quantizeGeneric: 12,
	quantizationVolume: "mesh"
};
/**
* Applies Draco compression using {@link KHRDracoMeshCompression KHR_draco_mesh_compression}.
* Draco compression can reduce the size of triangle geometry.
*
* This function is a thin wrapper around the {@link KHRDracoMeshCompression} extension.
*
* ### Example
*
* ```typescript
* import { NodeIO } from '@gltf-transform/core';
* import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
* import { draco } from '@gltf-transform/functions';
* import draco3d from 'draco3dgltf';
*
* const io = new NodeIO()
* 	.registerExtensions([KHRDracoMeshCompression])
* 	.registerDependencies({
* 		'draco3d.encoder': await draco3d.createEncoderModule()
* 	});
*
* await document.transform(
*   draco({method: 'edgebreaker'})
* );
*
* await io.write('compressed.glb', document);
* ```
*
* Compression is deferred until generating output with an I/O class.
*
* @category Transforms
*/
function draco(_options = DRACO_DEFAULTS) {
	const options = assignDefaults(DRACO_DEFAULTS, _options);
	return createTransform(NAME$22, async (document) => {
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("draco: Missing support for KHR_mesh_primitive_restart.");
		await document.transform(weld());
		document.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({
			method: options.method === "edgebreaker" ? KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER : KHRDracoMeshCompression.EncoderMethod.SEQUENTIAL,
			encodeSpeed: options.encodeSpeed,
			decodeSpeed: options.decodeSpeed,
			quantizationBits: {
				POSITION: options.quantizePosition,
				NORMAL: options.quantizeNormal,
				COLOR: options.quantizeColor,
				TEX_COORD: options.quantizeTexcoord,
				GENERIC: options.quantizeGeneric
			},
			quantizationVolume: options.quantizationVolume
		});
	});
}
//#endregion
//#region ../../node_modules/gl-matrix/esm/vec4.js
/**
* 4 Dimensional Vector
* @module vec4
*/
/**
* Creates a new, empty vec4
*
* @returns {vec4} a new 4D vector
*/
function create() {
	var out = new ARRAY_TYPE(4);
	if (ARRAY_TYPE != Float32Array) {
		out[0] = 0;
		out[1] = 0;
		out[2] = 0;
		out[3] = 0;
	}
	return out;
}
/**
* Adds two vec4's
*
* @param {vec4} out the receiving vector
* @param {ReadonlyVec4} a the first operand
* @param {ReadonlyVec4} b the second operand
* @returns {vec4} out
*/
function add(out, a, b) {
	out[0] = a[0] + b[0];
	out[1] = a[1] + b[1];
	out[2] = a[2] + b[2];
	out[3] = a[3] + b[3];
	return out;
}
/**
* Subtracts vector b from vector a
*
* @param {vec4} out the receiving vector
* @param {ReadonlyVec4} a the first operand
* @param {ReadonlyVec4} b the second operand
* @returns {vec4} out
*/
function subtract(out, a, b) {
	out[0] = a[0] - b[0];
	out[1] = a[1] - b[1];
	out[2] = a[2] - b[2];
	out[3] = a[3] - b[3];
	return out;
}
/**
* Multiplies two vec4's
*
* @param {vec4} out the receiving vector
* @param {ReadonlyVec4} a the first operand
* @param {ReadonlyVec4} b the second operand
* @returns {vec4} out
*/
function multiply(out, a, b) {
	out[0] = a[0] * b[0];
	out[1] = a[1] * b[1];
	out[2] = a[2] * b[2];
	out[3] = a[3] * b[3];
	return out;
}
/**
* Scales a vec4 by a scalar number
*
* @param {vec4} out the receiving vector
* @param {ReadonlyVec4} a the vector to scale
* @param {Number} b amount to scale the vector by
* @returns {vec4} out
*/
function scale(out, a, b) {
	out[0] = a[0] * b;
	out[1] = a[1] * b;
	out[2] = a[2] * b;
	out[3] = a[3] * b;
	return out;
}
/**
* Calculates the length of a vec4
*
* @param {ReadonlyVec4} a vector to calculate length of
* @returns {Number} length of a
*/
function length(a) {
	var x = a[0];
	var y = a[1];
	var z = a[2];
	var w = a[3];
	return Math.sqrt(x * x + y * y + z * z + w * w);
}
/**
* Alias for {@link vec4.subtract}
* @function
*/
var sub = subtract;
/**
* Alias for {@link vec4.multiply}
* @function
*/
var mul = multiply;
/**
* Alias for {@link vec4.length}
* @function
*/
var len = length;
(function() {
	var vec = create();
	return function(a, stride, offset, count, fn, arg) {
		var i, l;
		if (!stride) stride = 4;
		if (!offset) offset = 0;
		if (count) l = Math.min(count * stride + offset, a.length);
		else l = a.length;
		for (i = offset; i < l; i += stride) {
			vec[0] = a[i];
			vec[1] = a[i + 1];
			vec[2] = a[i + 2];
			vec[3] = a[i + 3];
			fn(vec, vec, arg);
			a[i] = vec[0];
			a[i + 1] = vec[1];
			a[i + 2] = vec[2];
			a[i + 3] = vec[3];
		}
		return a;
	};
})();
//#endregion
//#region src/get-texture-color-space.ts
const SRGB_PATTERN = /color|emissive|diffuse/i;
/**
* Returns the color space (if any) implied by the {@link Material} slots to
* which a texture is assigned, or null for non-color textures. If the texture
* is not connected to any {@link Material}, this function will also return
* null — any metadata in the image file will be ignored.
*
* Under current glTF specifications, only 'srgb' and non-color (null) textures
* are used.
*
* Example:
*
* ```typescript
* import { getTextureColorSpace } from '@gltf-transform/functions';
*
* const baseColorTexture = material.getBaseColorTexture();
* const normalTexture = material.getNormalTexture();
*
* getTextureColorSpace(baseColorTexture); // → 'srgb'
* getTextureColorSpace(normalTexture); // → null
* ```
*/
function getTextureColorSpace(texture) {
	return texture.getGraph().listParentEdges(texture).some((edge) => {
		return edge.getAttributes().isColor || SRGB_PATTERN.test(edge.getName());
	}) ? "srgb" : null;
}
//#endregion
//#region src/list-texture-info.ts
/**
* Lists all {@link TextureInfo} definitions associated with a given
* {@link Texture}. May be used to determine which UV transforms
* and texCoord indices are applied to the material, without explicitly
* checking the material properties and extensions.
*
* Example:
*
* ```typescript
* // Find TextureInfo instances associated with the texture.
* const results = listTextureInfo(texture);
*
* // Find which UV sets (TEXCOORD_0, TEXCOORD_1, ...) are required.
* const texCoords = results.map((info) => info.getTexCoord());
* // → [0, 1]
* ```
*/
function listTextureInfo(texture) {
	const graph = texture.getGraph();
	const results = /* @__PURE__ */ new Set();
	for (const textureEdge of graph.listParentEdges(texture)) {
		const parent = textureEdge.getParent();
		const name = textureEdge.getName() + "Info";
		for (const edge of graph.listChildEdges(parent)) {
			const child = edge.getChild();
			if (child instanceof TextureInfo && edge.getName() === name) results.add(child);
		}
	}
	return Array.from(results);
}
/**
* Lists all {@link TextureInfo} definitions associated with any {@link Texture}
* on the given {@link Material}. May be used to determine which UV transforms
* and texCoord indices are applied to the material, without explicitly
* checking the material properties and extensions.
*
* Example:
*
* ```typescript
* const results = listTextureInfoByMaterial(material);
*
* const texCoords = results.map((info) => info.getTexCoord());
* // → [0, 1]
* ```
*/
function listTextureInfoByMaterial(material) {
	const graph = material.getGraph();
	const visited = /* @__PURE__ */ new Set();
	const results = /* @__PURE__ */ new Set();
	function traverse(prop) {
		const textureInfoNames = /* @__PURE__ */ new Set();
		for (const edge of graph.listChildEdges(prop)) if (edge.getChild() instanceof Texture) textureInfoNames.add(edge.getName() + "Info");
		for (const edge of graph.listChildEdges(prop)) {
			const child = edge.getChild();
			if (visited.has(child)) continue;
			visited.add(child);
			if (child instanceof TextureInfo && textureInfoNames.has(edge.getName())) results.add(child);
			else if (child instanceof ExtensionProperty) traverse(child);
		}
	}
	traverse(material);
	return Array.from(results);
}
//#endregion
//#region src/list-texture-slots.ts
/**
* Returns names of all texture slots using the given texture.
*
* Example:
*
* ```js
* const slots = listTextureSlots(texture);
* // → ['occlusionTexture', 'metallicRoughnessTexture']
* ```
*/
function listTextureSlots(texture) {
	const root = Document.fromGraph(texture.getGraph()).getRoot();
	const slots = texture.getGraph().listParentEdges(texture).filter((edge) => edge.getParent() !== root).map((edge) => edge.getName());
	return Array.from(new Set(slots));
}
//#endregion
//#region src/prune.ts
const NAME$21 = "prune";
const EPS = 3 / 255;
const PRUNE_DEFAULTS = {
	propertyTypes: [
		PropertyType.NODE,
		PropertyType.SKIN,
		PropertyType.MESH,
		PropertyType.CAMERA,
		PropertyType.PRIMITIVE,
		PropertyType.PRIMITIVE_TARGET,
		PropertyType.ANIMATION,
		PropertyType.MATERIAL,
		PropertyType.TEXTURE,
		PropertyType.ACCESSOR,
		PropertyType.BUFFER
	],
	keepLeaves: false,
	keepAttributes: false,
	keepIndices: false,
	keepSolidTextures: false,
	keepExtras: false
};
/**
* Removes properties from the file if they are not referenced by a {@link Scene}. Commonly helpful
* for cleaning up after other operations, e.g. allowing a node to be detached and any unused
* meshes, materials, or other resources to be removed automatically.
*
* Example:
*
* ```javascript
* import { PropertyType } from '@gltf-transform/core';
* import { prune } from '@gltf-transform/functions';
*
* document.getRoot().listMaterials(); // → [Material, Material]
*
* await document.transform(
* 	prune({
* 		propertyTypes: [PropertyType.MATERIAL],
* 		keepExtras: true
* 	})
* );
*
* document.getRoot().listMaterials(); // → [Material]
* ```
*
* By default, pruning will aggressively remove most unused resources. Use
* {@link PruneOptions} to limit what is considered for pruning.
*
* @category Transforms
*/
function prune(_options = PRUNE_DEFAULTS) {
	const options = assignDefaults(PRUNE_DEFAULTS, _options);
	const propertyTypes = new Set(options.propertyTypes);
	const keepExtras = options.keepExtras;
	return createTransform(NAME$21, async (document) => {
		const logger = document.getLogger();
		const root = document.getRoot();
		const graph = document.getGraph();
		const counter = new DisposeCounter();
		const onDispose = (event) => counter.dispose(event.target);
		graph.addEventListener("node:dispose", onDispose);
		if (propertyTypes.has(PropertyType.MESH)) for (const mesh of root.listMeshes()) {
			if (mesh.listPrimitives().length > 0) continue;
			mesh.dispose();
		}
		if (propertyTypes.has(PropertyType.NODE)) {
			if (!options.keepLeaves) for (const scene of root.listScenes()) nodeTreeShake(graph, scene, keepExtras);
			for (const node of root.listNodes()) treeShake(node, keepExtras);
		}
		if (propertyTypes.has(PropertyType.SKIN)) for (const skin of root.listSkins()) treeShake(skin, keepExtras);
		if (propertyTypes.has(PropertyType.MESH)) for (const mesh of root.listMeshes()) treeShake(mesh, keepExtras);
		if (propertyTypes.has(PropertyType.CAMERA)) for (const camera of root.listCameras()) treeShake(camera, keepExtras);
		if (propertyTypes.has(PropertyType.PRIMITIVE)) indirectTreeShake(graph, PropertyType.PRIMITIVE, keepExtras);
		if (propertyTypes.has(PropertyType.PRIMITIVE_TARGET)) indirectTreeShake(graph, PropertyType.PRIMITIVE_TARGET, keepExtras);
		if (!options.keepAttributes && propertyTypes.has(PropertyType.ACCESSOR)) {
			const materialPrims = /* @__PURE__ */ new Map();
			for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
				const material = prim.getMaterial();
				if (!material) continue;
				const unused = listUnusedSemantics(prim, listRequiredSemantics(document, prim, material));
				pruneAttributes(prim, unused);
				prim.listTargets().forEach((target) => pruneAttributes(target, unused));
				materialPrims.has(material) ? materialPrims.get(material).add(prim) : materialPrims.set(material, /* @__PURE__ */ new Set([prim]));
			}
			for (const [material, prims] of materialPrims) shiftTexCoords(material, Array.from(prims));
		}
		if (propertyTypes.has(PropertyType.ANIMATION)) for (const anim of root.listAnimations()) {
			for (const channel of anim.listChannels()) if (!channel.getTargetNode()) channel.dispose();
			if (!anim.listChannels().length) {
				const samplers = anim.listSamplers();
				treeShake(anim, keepExtras);
				samplers.forEach((sampler) => treeShake(sampler, keepExtras));
			} else anim.listSamplers().forEach((sampler) => treeShake(sampler, keepExtras));
		}
		if (propertyTypes.has(PropertyType.MATERIAL)) root.listMaterials().forEach((material) => treeShake(material, keepExtras));
		if (propertyTypes.has(PropertyType.TEXTURE)) {
			root.listTextures().forEach((texture) => treeShake(texture, keepExtras));
			if (!options.keepSolidTextures) await pruneSolidTextures(document);
		}
		if (propertyTypes.has(PropertyType.ACCESSOR)) root.listAccessors().forEach((accessor) => treeShake(accessor, keepExtras));
		if (propertyTypes.has(PropertyType.BUFFER)) root.listBuffers().forEach((buffer) => treeShake(buffer, keepExtras));
		graph.removeEventListener("node:dispose", onDispose);
		if (!counter.empty()) {
			const str = counter.entries().map(([type, count]) => `${type} (${count})`).join(", ");
			logger.info(`${NAME$21}: Removed types... ${str}`);
		} else logger.debug(`${NAME$21}: No unused properties found.`);
		logger.debug(`${NAME$21}: Complete.`);
	});
}
/**********************************************************************************************
* Utility for disposing properties and reporting statistics afterward.
*/
var DisposeCounter = class {
	disposed = {};
	empty() {
		for (const _key in this.disposed) return false;
		return true;
	}
	entries() {
		return Object.entries(this.disposed);
	}
	/** Records properties disposed by type. */
	dispose(prop) {
		this.disposed[prop.propertyType] = this.disposed[prop.propertyType] || 0;
		this.disposed[prop.propertyType]++;
	}
};
/**********************************************************************************************
* Helper functions for the {@link prune} transform.
*
* IMPORTANT: These functions were previously declared in function scope, but
* broke in the CommonJS build due to a buggy Babel transform. See:
* https://github.com/donmccurdy/glTF-Transform/issues/1140
*/
/** Disposes of the given property if it is unused. */
function treeShake(prop, keepExtras) {
	const parents = prop.listParents().filter((p) => !(p instanceof Root || p instanceof AnimationChannel));
	const needsExtras = keepExtras && !isEmptyObject(prop.getExtras());
	if (!parents.length && !needsExtras) prop.dispose();
}
/**
* For property types the Root does not maintain references to, we'll need to search the
* graph. It's possible that objects may have been constructed without any outbound links,
* but since they're not on the graph they don't need to be tree-shaken.
*/
function indirectTreeShake(graph, propertyType, keepExtras) {
	for (const edge of graph.listEdges()) {
		const parent = edge.getParent();
		if (parent.propertyType === propertyType) treeShake(parent, keepExtras);
	}
}
/** Iteratively prunes leaf Nodes without contents. */
function nodeTreeShake(graph, prop, keepExtras) {
	prop.listChildren().forEach((child) => nodeTreeShake(graph, child, keepExtras));
	if (prop instanceof Scene) return;
	const isUsed = graph.listParentEdges(prop).some((e) => {
		const ptype = e.getParent().propertyType;
		return ptype !== PropertyType.ROOT && ptype !== PropertyType.SCENE && ptype !== PropertyType.NODE;
	});
	const isEmpty = graph.listChildren(prop).length === 0;
	const needsExtras = keepExtras && !isEmptyObject(prop.getExtras());
	if (isEmpty && !isUsed && !needsExtras) prop.dispose();
}
function pruneAttributes(prim, unused) {
	for (const semantic of unused) prim.setAttribute(semantic, null);
}
/**
* Lists vertex attribute semantics that are unused when rendering a given primitive.
*/
function listUnusedSemantics(prim, required) {
	const unused = [];
	for (const semantic of prim.listSemantics()) if (semantic === "NORMAL" && !required.has(semantic)) unused.push(semantic);
	else if (semantic === "TANGENT" && !required.has(semantic)) unused.push(semantic);
	else if (semantic.startsWith("TEXCOORD_") && !required.has(semantic)) unused.push(semantic);
	else if (semantic.startsWith("COLOR_") && semantic !== "COLOR_0") unused.push(semantic);
	return unused;
}
/**
* Lists vertex attribute semantics required by a material. Does not include
* attributes that would be used unconditionally, like POSITION or NORMAL.
*/
function listRequiredSemantics(document, prim, material, semantics = /* @__PURE__ */ new Set()) {
	const edges = document.getGraph().listChildEdges(material);
	const textureNames = /* @__PURE__ */ new Set();
	for (const edge of edges) if (edge.getChild() instanceof Texture) textureNames.add(edge.getName());
	for (const edge of edges) {
		const name = edge.getName();
		const child = edge.getChild();
		if (child instanceof TextureInfo) {
			if (textureNames.has(name.replace(/Info$/, ""))) semantics.add(`TEXCOORD_${child.getTexCoord()}`);
		}
		if (child instanceof Texture && name.match(/normalTexture/i)) semantics.add("TANGENT");
		if (child instanceof ExtensionProperty) listRequiredSemantics(document, prim, child, semantics);
	}
	const isLit = material instanceof Material && !material.getExtension("KHR_materials_unlit");
	const isPoints = prim.getMode() === Primitive.Mode.POINTS;
	if (isLit && !isPoints) semantics.add("NORMAL");
	return semantics;
}
/**
* Shifts texCoord indices on the given material and primitives assigned to
* that material, such that indices start at zero and ascend without gaps.
* Prior to calling this function, the implementation must ensure that:
* - All TEXCOORD_n attributes on these prims are used by the material.
* - Material does not require any unavailable TEXCOORD_n attributes.
*
* TEXCOORD_n attributes on morph targets are shifted alongside the parent
* prim, but gaps may remain in their semantic lists.
*/
function shiftTexCoords(material, prims) {
	const textureInfoList = listTextureInfoByMaterial(material);
	const texCoordSet = new Set(textureInfoList.map((info) => info.getTexCoord()));
	const texCoordList = Array.from(texCoordSet).sort();
	const texCoordMap = new Map(texCoordList.map((texCoord, index) => [texCoord, index]));
	const semanticMap = new Map(texCoordList.map((texCoord, index) => [`TEXCOORD_${texCoord}`, `TEXCOORD_${index}`]));
	for (const textureInfo of textureInfoList) {
		const texCoord = textureInfo.getTexCoord();
		textureInfo.setTexCoord(texCoordMap.get(texCoord));
	}
	for (const prim of prims) {
		const semantics = prim.listSemantics().filter((semantic) => semantic.startsWith("TEXCOORD_")).sort();
		updatePrim(prim, semantics);
		prim.listTargets().forEach((target) => updatePrim(target, semantics));
	}
	function updatePrim(prim, srcSemantics) {
		for (const srcSemantic of srcSemantics) {
			const uv = prim.getAttribute(srcSemantic);
			if (!uv) continue;
			const dstSemantic = semanticMap.get(srcSemantic);
			if (dstSemantic === srcSemantic) continue;
			prim.setAttribute(dstSemantic, uv);
			prim.setAttribute(srcSemantic, null);
		}
	}
}
/**********************************************************************************************
* Prune solid (single-color) textures.
*/
async function pruneSolidTextures(document) {
	const root = document.getRoot();
	const graph = document.getGraph();
	const logger = document.getLogger();
	const pending = root.listTextures().map(async (texture) => {
		const factor = await getTextureFactor(texture);
		if (!factor) return;
		if (getTextureColorSpace(texture) === "srgb") ColorUtils.convertSRGBToLinear(factor, factor);
		const name = texture.getName() || texture.getURI();
		const size = texture.getSize()?.join("x");
		const slots = listTextureSlots(texture);
		for (const edge of graph.listParentEdges(texture)) {
			const parent = edge.getParent();
			if (parent !== root && applyMaterialFactor(parent, factor, edge.getName(), logger)) edge.dispose();
		}
		if (texture.listParents().length === 1) {
			texture.dispose();
			logger.debug(`${NAME$21}: Removed solid-color texture "${name}" (${size}px ${slots.join(", ")})`);
		}
	});
	await Promise.all(pending);
}
function applyMaterialFactor(material, factor, slot, logger) {
	if (material instanceof Material) switch (slot) {
		case "baseColorTexture":
			material.setBaseColorFactor(mul(factor, factor, material.getBaseColorFactor()));
			return true;
		case "emissiveTexture":
			material.setEmissiveFactor(mul$1([
				0,
				0,
				0
			], factor.slice(0, 3), material.getEmissiveFactor()));
			return true;
		case "occlusionTexture": return Math.abs(factor[0] - 1) <= EPS;
		case "metallicRoughnessTexture":
			material.setRoughnessFactor(factor[1] * material.getRoughnessFactor());
			material.setMetallicFactor(factor[2] * material.getMetallicFactor());
			return true;
		case "normalTexture": return len(sub(create(), factor, [
			.5,
			.5,
			1,
			1
		])) <= EPS;
	}
	logger.warn(`${NAME$21}: Detected single-color ${slot} texture. Pruning ${slot} not yet supported.`);
	return false;
}
async function getTextureFactor(texture) {
	const pixels = await maybeGetPixels(texture);
	if (!pixels) return null;
	const min = [
		Infinity,
		Infinity,
		Infinity,
		Infinity
	];
	const max = [
		-Infinity,
		-Infinity,
		-Infinity,
		-Infinity
	];
	const target = [
		0,
		0,
		0,
		0
	];
	const [width, height] = pixels.shape;
	for (let i = 0; i < width; i++) {
		for (let j = 0; j < height; j++) for (let k = 0; k < 4; k++) {
			min[k] = Math.min(min[k], pixels.get(i, j, k));
			max[k] = Math.max(max[k], pixels.get(i, j, k));
		}
		if (len(sub(target, max, min)) / 255 > EPS) return null;
	}
	return scale(target, add(target, max, min), .5 / 255);
}
async function maybeGetPixels(texture) {
	try {
		return await getPixels(texture.getImage(), texture.getMimeType());
	} catch {
		return null;
	}
}
//#endregion
//#region src/flatten.ts
const NAME$20 = "flatten";
const FLATTEN_DEFAULTS = { cleanup: true };
/**
* Flattens the scene graph, leaving {@link Node Nodes} with
* {@link Mesh Meshes}, {@link Camera Cameras}, and other attachments
* as direct children of the {@link Scene}. Skeletons and their
* descendants are left in their original Node structure.
*
* {@link Animation} targeting a Node or its parents will
* prevent that Node from being moved.
*
* Example:
*
* ```ts
* import { flatten } from '@gltf-transform/functions';
*
* await document.transform(flatten());
* ```
*
* @category Transforms
*/
function flatten(_options = FLATTEN_DEFAULTS) {
	const options = assignDefaults(FLATTEN_DEFAULTS, _options);
	return createTransform(NAME$20, async (document) => {
		const root = document.getRoot();
		const logger = document.getLogger();
		const joints = /* @__PURE__ */ new Set();
		for (const skin of root.listSkins()) for (const joint of skin.listJoints()) joints.add(joint);
		const animated = /* @__PURE__ */ new Set();
		for (const animation of root.listAnimations()) for (const channel of animation.listChannels()) {
			const node = channel.getTargetNode();
			if (node && channel.getTargetPath() !== "weights") animated.add(node);
		}
		const hasJointParent = /* @__PURE__ */ new Set();
		const hasAnimatedParent = /* @__PURE__ */ new Set();
		for (const scene of root.listScenes()) scene.traverse((node) => {
			const parent = node.getParentNode();
			if (!parent) return;
			if (joints.has(parent) || hasJointParent.has(parent)) hasJointParent.add(node);
			if (animated.has(parent) || hasAnimatedParent.has(parent)) hasAnimatedParent.add(node);
		});
		for (const scene of root.listScenes()) scene.traverse((node) => {
			if (animated.has(node)) return;
			if (hasJointParent.has(node)) return;
			if (hasAnimatedParent.has(node)) return;
			clearNodeParent(node);
		});
		if (animated.size) logger.debug(`${NAME$20}: Flattening node hierarchies with TRS animation not yet supported.`);
		if (options.cleanup) await document.transform(prune({
			propertyTypes: [PropertyType.NODE],
			keepLeaves: false
		}));
		logger.debug(`${NAME$20}: Complete.`);
	});
}
//#endregion
//#region src/get-bounds.ts
/**
* Computes bounding box (AABB) in world space for the given {@link Node} or {@link Scene}.
*
* Example:
*
* ```ts
* import { getBounds } from '@gltf-transform/functions';
*
* const {min, max} = getBounds(scene);
* ```
*/
function getBounds(node) {
	return getBounds$1(node);
}
//#endregion
//#region src/inspect.ts
/** Inspects the contents of a glTF file and returns a JSON report. */
function inspect(doc) {
	return {
		scenes: listScenes(doc),
		meshes: listMeshes(doc),
		materials: listMaterials(doc),
		textures: listTextures(doc),
		animations: listAnimations(doc)
	};
}
/** List scenes. */
function listScenes(doc) {
	return { properties: doc.getRoot().listScenes().map((scene) => {
		const root = scene.listChildren()[0];
		const sceneBounds = getBounds$1(scene);
		return {
			name: scene.getName(),
			rootName: root ? root.getName() : "",
			bboxMin: toPrecision(sceneBounds.min),
			bboxMax: toPrecision(sceneBounds.max),
			renderVertexCount: getSceneVertexCount(scene, "render"),
			uploadVertexCount: getSceneVertexCount(scene, "upload"),
			uploadNaiveVertexCount: getSceneVertexCount(scene, "upload-naive")
		};
	}) };
}
/** List meshes. */
function listMeshes(doc) {
	return { properties: doc.getRoot().listMeshes().map((mesh) => {
		const instances = mesh.listParents().filter((parent) => parent.propertyType !== PropertyType.ROOT).length;
		let glPrimitives = 0;
		const semantics = /* @__PURE__ */ new Set();
		const meshIndices = /* @__PURE__ */ new Set();
		const meshAccessors = /* @__PURE__ */ new Set();
		mesh.listPrimitives().forEach((prim) => {
			for (const semantic of prim.listSemantics()) {
				const attr = prim.getAttribute(semantic);
				semantics.add(semantic + ":" + accessorToTypeLabel(attr));
				meshAccessors.add(attr);
			}
			for (const targ of prim.listTargets()) targ.listAttributes().forEach((attr) => meshAccessors.add(attr));
			const indices = prim.getIndices();
			if (indices) {
				meshIndices.add(accessorToTypeLabel(indices));
				meshAccessors.add(indices);
			}
			glPrimitives += getGLPrimitiveCount(prim);
		});
		let size = 0;
		Array.from(meshAccessors).forEach((a) => size += a.getArray().byteLength);
		const modes = mesh.listPrimitives().map((prim) => MeshPrimitiveModeLabels[prim.getMode()]);
		return {
			name: mesh.getName(),
			mode: Array.from(new Set(modes)),
			meshPrimitives: mesh.listPrimitives().length,
			glPrimitives,
			vertices: getMeshVertexCount(mesh, "upload"),
			indices: Array.from(meshIndices).sort(),
			attributes: Array.from(semantics).sort(),
			instances,
			size
		};
	}) };
}
/** List materials. */
function listMaterials(doc) {
	return { properties: doc.getRoot().listMaterials().map((material) => {
		const instances = material.listParents().filter((parent) => parent.propertyType !== PropertyType.ROOT).length;
		const extensions = new Set(material.listExtensions());
		const slots = doc.getGraph().listEdges().filter((ref) => {
			const child = ref.getChild();
			const parent = ref.getParent();
			if (child instanceof Texture && parent === material) return true;
			if (child instanceof Texture && parent instanceof ExtensionProperty && extensions.has(parent)) return true;
			return false;
		}).map((ref) => ref.getName());
		return {
			name: material.getName(),
			instances,
			textures: slots,
			alphaMode: material.getAlphaMode(),
			doubleSided: material.getDoubleSided()
		};
	}) };
}
/** List textures. */
function listTextures(doc) {
	return { properties: doc.getRoot().listTextures().map((texture) => {
		const instances = texture.listParents().filter((parent) => parent.propertyType !== PropertyType.ROOT).length;
		const slots = doc.getGraph().listParentEdges(texture).filter((edge) => edge.getParent().propertyType !== PropertyType.ROOT).map((edge) => edge.getName());
		const resolution = ImageUtils.getSize(texture.getImage(), texture.getMimeType());
		let compression = "";
		if (texture.getMimeType() === "image/ktx2") {
			const dfd = read(texture.getImage()).dataFormatDescriptor[0];
			if (dfd.colorModel === KHR_DF_MODEL_ETC1S) compression = "ETC1S";
			else if (dfd.colorModel === KHR_DF_MODEL_UASTC) compression = "UASTC";
		}
		return {
			name: texture.getName(),
			uri: texture.getURI(),
			slots: Array.from(new Set(slots)),
			instances,
			mimeType: texture.getMimeType(),
			compression,
			resolution: resolution ? resolution.join("x") : "",
			size: texture.getImage().byteLength,
			gpuSize: ImageUtils.getVRAMByteLength(texture.getImage(), texture.getMimeType())
		};
	}) };
}
/** List animations. */
function listAnimations(doc) {
	return { properties: doc.getRoot().listAnimations().map((anim) => {
		let minTime = Infinity;
		let maxTime = -Infinity;
		anim.listSamplers().forEach((sampler) => {
			const input = sampler.getInput();
			if (!input) return;
			minTime = Math.min(minTime, input.getMin([])[0]);
			maxTime = Math.max(maxTime, input.getMax([])[0]);
		});
		let size = 0;
		let keyframes = 0;
		const accessors = /* @__PURE__ */ new Set();
		anim.listSamplers().forEach((sampler) => {
			const input = sampler.getInput();
			const output = sampler.getOutput();
			if (!input) return;
			keyframes += input.getCount();
			accessors.add(input);
			if (!output) return;
			accessors.add(output);
		});
		Array.from(accessors).forEach((accessor) => {
			size += accessor.getArray().byteLength;
		});
		return {
			name: anim.getName(),
			channels: anim.listChannels().length,
			samplers: anim.listSamplers().length,
			duration: Math.round((maxTime - minTime) * 1e3) / 1e3,
			keyframes,
			size
		};
	}) };
}
const MeshPrimitiveModeLabels = [
	"POINTS",
	"LINES",
	"LINE_LOOP",
	"LINE_STRIP",
	"TRIANGLES",
	"TRIANGLE_STRIP",
	"TRIANGLE_FAN"
];
const NumericTypeLabels = {
	Float32Array: "f32",
	Uint32Array: "u32",
	Uint16Array: "u16",
	Uint8Array: "u8",
	Int32Array: "i32",
	Int16Array: "i16",
	Int8Array: "i8"
};
/** Maps values in a vector to a finite precision. */
function toPrecision(v) {
	for (let i = 0; i < v.length; i++) if (v[i].toFixed) v[i] = Number(v[i].toFixed(5));
	return v;
}
function accessorToTypeLabel(accessor) {
	const array = accessor.getArray();
	return (NumericTypeLabels[array.constructor.name] || "?") + (accessor.getNormalized() ? "_norm" : "");
}
//#endregion
//#region src/instance.ts
const NAME$19 = "instance";
const INSTANCE_DEFAULTS = { min: 5 };
/**
* Creates GPU instances (with {@link EXTMeshGPUInstancing}) for shared {@link Mesh} references. In
* engines supporting the extension, reused Meshes will be drawn with GPU instancing, greatly
* reducing draw calls and improving performance in many cases. If you're not sure that identical
* Meshes share vertex data and materials ("linked duplicates"), run {@link dedup} first to link them.
*
* Example:
*
* ```javascript
* import { dedup, instance } from '@gltf-transform/functions';
*
* await document.transform(
* 	dedup(),
* 	instance({min: 5}),
* );
* ```
*
* @category Transforms
*/
function instance(_options = INSTANCE_DEFAULTS) {
	const options = assignDefaults(INSTANCE_DEFAULTS, _options);
	return createTransform(NAME$19, (doc) => {
		const logger = doc.getLogger();
		const root = doc.getRoot();
		if (root.listAnimations().length) {
			logger.warn(`${NAME$19}: Instancing is not currently supported for animated models.`);
			logger.debug(`${NAME$19}: Complete.`);
			return;
		}
		const batchExtension = doc.createExtension(EXTMeshGPUInstancing);
		let numBatches = 0;
		let numInstances = 0;
		for (const scene of root.listScenes()) {
			const meshInstances = /* @__PURE__ */ new Map();
			scene.traverse((node) => {
				const mesh = node.getMesh();
				if (!mesh) return;
				if (node.getExtension("EXT_mesh_gpu_instancing")) return;
				meshInstances.set(mesh, (meshInstances.get(mesh) || /* @__PURE__ */ new Set()).add(node));
			});
			const modifiedNodes = [];
			for (const mesh of Array.from(meshInstances.keys())) {
				const nodes = Array.from(meshInstances.get(mesh));
				if (nodes.length < options.min) continue;
				if (nodes.some((node) => node.getSkin())) continue;
				if (mesh.listPrimitives().some(hasVolume) && nodes.some(hasScale)) continue;
				const batch = createBatch(doc, batchExtension, mesh, nodes.length);
				const batchTranslation = batch.getAttribute("TRANSLATION");
				const batchRotation = batch.getAttribute("ROTATION");
				const batchScale = batch.getAttribute("SCALE");
				const batchNode = doc.createNode().setMesh(mesh).setExtension("EXT_mesh_gpu_instancing", batch);
				scene.addChild(batchNode);
				let needsTranslation = false;
				let needsRotation = false;
				let needsScale = false;
				for (let i = 0; i < nodes.length; i++) {
					let t, r, s;
					const node = nodes[i];
					batchTranslation.setElement(i, t = node.getWorldTranslation());
					batchRotation.setElement(i, r = node.getWorldRotation());
					batchScale.setElement(i, s = node.getWorldScale());
					if (!MathUtils.eq(t, [
						0,
						0,
						0
					])) needsTranslation = true;
					if (!MathUtils.eq(r, [
						0,
						0,
						0,
						1
					])) needsRotation = true;
					if (!MathUtils.eq(s, [
						1,
						1,
						1
					])) needsScale = true;
				}
				if (!needsTranslation) batchTranslation.dispose();
				if (!needsRotation) batchRotation.dispose();
				if (!needsScale) batchScale.dispose();
				if (!needsTranslation && !needsRotation && !needsScale) {
					batchNode.dispose();
					batch.dispose();
					continue;
				}
				for (const node of nodes) {
					node.setMesh(null);
					modifiedNodes.push(node);
				}
				numBatches++;
				numInstances += nodes.length;
			}
			pruneUnusedNodes(modifiedNodes, logger);
		}
		if (numBatches > 0) logger.info(`${NAME$19}: Created ${numBatches} batches, with ${numInstances} total instances.`);
		else logger.info(`${NAME$19}: No meshes with >=${options.min} parent nodes were found.`);
		if (batchExtension.listProperties().length === 0) batchExtension.dispose();
		logger.debug(`${NAME$19}: Complete.`);
	});
}
function pruneUnusedNodes(nodes, logger) {
	let node;
	let unusedNodes = 0;
	while (node = nodes.pop()) {
		if (node.listChildren().length || node.getCamera() || node.getMesh() || node.getSkin() || node.listExtensions().length) continue;
		const nodeParent = node.getParentNode();
		if (nodeParent) nodes.push(nodeParent);
		node.dispose();
		unusedNodes++;
	}
	logger.debug(`${NAME$19}: Removed ${unusedNodes} unused nodes.`);
}
function hasVolume(prim) {
	const material = prim.getMaterial();
	return !!(material && material.getExtension("KHR_materials_volume"));
}
function hasScale(node) {
	const scale = node.getWorldScale();
	return !MathUtils.eq(scale, [
		1,
		1,
		1
	]);
}
function createBatch(doc, batchExtension, mesh, count) {
	const buffer = mesh.listPrimitives()[0].getAttribute("POSITION").getBuffer();
	const batchTranslation = doc.createAccessor().setType("VEC3").setArray(new Float32Array(3 * count)).setBuffer(buffer);
	const batchRotation = doc.createAccessor().setType("VEC4").setArray(new Float32Array(4 * count)).setBuffer(buffer);
	const batchScale = doc.createAccessor().setType("VEC3").setArray(new Float32Array(3 * count)).setBuffer(buffer);
	return batchExtension.createInstancedMesh().setAttribute("TRANSLATION", batchTranslation).setAttribute("ROTATION", batchRotation).setAttribute("SCALE", batchScale);
}
//#endregion
//#region src/join-primitives.ts
const JOIN_PRIMITIVE_DEFAULTS = { skipValidation: false };
const EMPTY_U32 = 2 ** 32 - 1;
/**
* Given a list of compatible Mesh {@link Primitive Primitives}, returns new Primitive
* containing their vertex data. Compatibility requires that all Primitives share the
* same {@link Material Materials}, draw mode, and vertex attribute types. Primitives
* using morph targets cannot currently be joined.
*
* Example:
*
* ```javascript
* import { joinPrimitives } from '@gltf-transform/functions';
*
* // Succeeds if Primitives are compatible, or throws an error.
* const result = joinPrimitives(mesh.listPrimitives());
*
* for (const prim of mesh.listPrimitives()) {
* 	prim.dispose();
* }
*
* mesh.addPrimitive(result);
* ```
*/
function joinPrimitives(prims, _options = {}) {
	const options = assignDefaults(JOIN_PRIMITIVE_DEFAULTS, _options);
	const templatePrim = prims[0];
	const document = Document.fromGraph(templatePrim.getGraph());
	if (!options.skipValidation && new Set(prims.map(createPrimGroupKey)).size > 1) throw new Error("Requires >=2 Primitives, sharing the same Material and Mode, with compatible vertex attributes and indices.");
	const primRemaps = [];
	const isRestartEnabled = isPrimitiveRestartMode(templatePrim.getMode()) && !!templatePrim.getIndices();
	let dstVertexCount = 0;
	let dstIndicesCount = 0;
	for (let primIndex = 0; primIndex < prims.length; primIndex++) {
		const srcPrim = prims[primIndex];
		const srcIndices = srcPrim.getIndices();
		const srcVertexCount = srcPrim.getAttribute("POSITION").getCount();
		const srcIndicesArray = srcIndices ? srcIndices.getArray() : null;
		const srcIndicesCount = srcIndices ? srcIndices.getCount() : srcVertexCount;
		const srcRestart = srcIndices ? getPrimitiveRestartIndex(srcIndices.getComponentType()) : null;
		const remap = new Uint32Array(srcVertexCount).fill(EMPTY_U32);
		for (let i = 0; i < srcIndicesCount; i++) {
			const index = srcIndicesArray ? srcIndicesArray[i] : i;
			if (remap[index] === EMPTY_U32 && index !== srcRestart) remap[index] = dstVertexCount++;
		}
		primRemaps.push(remap);
		dstIndicesCount += srcIndicesCount;
	}
	const dstPrim = document.createPrimitive().setMode(templatePrim.getMode()).setMaterial(templatePrim.getMaterial());
	for (const semantic of templatePrim.listSemantics()) {
		const tplAttribute = templatePrim.getAttribute(semantic);
		const AttributeArray = ComponentTypeToTypedArray[tplAttribute.getComponentType()];
		const dstAttribute = shallowCloneAccessor(document, tplAttribute).setArray(new AttributeArray(dstVertexCount * tplAttribute.getElementSize()));
		dstPrim.setAttribute(semantic, dstAttribute);
	}
	if (isRestartEnabled) dstIndicesCount += prims.length - 1;
	const tplIndices = templatePrim.getIndices();
	const dstIndicesArray = tplIndices ? createIndicesEmpty(dstIndicesCount, dstVertexCount) : null;
	const dstIndices = tplIndices ? shallowCloneAccessor(document, tplIndices).setArray(dstIndicesArray) : null;
	const dstRestart = dstIndices ? getPrimitiveRestartIndex(dstIndices.getComponentType()) : null;
	dstPrim.setIndices(dstIndices);
	let dstIndicesOffset = 0;
	for (let primIndex = 0; primIndex < prims.length; primIndex++) {
		const srcPrim = prims[primIndex];
		const srcIndices = srcPrim.getIndices();
		const srcIndicesCount = srcIndices ? srcIndices.getCount() : -1;
		const remap = primRemaps[primIndex];
		if (srcIndices && dstIndices) {
			remapIndices(srcIndices, remap, dstIndices, dstIndicesOffset);
			dstIndicesOffset += srcIndicesCount;
			if (isRestartEnabled && primIndex + 1 < prims.length) dstIndicesArray[dstIndicesOffset++] = dstRestart;
		}
		for (const semantic of dstPrim.listSemantics()) remapAttribute$1(srcPrim.getAttribute(semantic), srcIndices, remap, dstPrim.getAttribute(semantic));
	}
	return dstPrim;
}
/**
* Internal variant of {@link compactAttribute}. Unlike compactAttribute,
* assumes the vertex count cannot change, and avoids cloning attributes.
* @hidden
* @internal
*/
function remapAttribute$1(srcAttribute, srcIndices, remap, dstAttribute) {
	const elementSize = srcAttribute.getElementSize();
	const srcIndicesArray = srcIndices ? srcIndices.getArray() : null;
	const srcVertexCount = srcAttribute.getCount();
	const srcArray = srcAttribute.getArray();
	const dstArray = dstAttribute.getArray();
	const done = new Uint8Array(srcAttribute.getCount());
	for (let i = 0, il = srcIndices ? srcIndices.getCount() : srcVertexCount; i < il; i++) {
		const srcIndex = srcIndicesArray ? srcIndicesArray[i] : i;
		const dstIndex = remap[srcIndex];
		if (done[dstIndex]) continue;
		for (let j = 0; j < elementSize; j++) dstArray[dstIndex * elementSize + j] = srcArray[srcIndex * elementSize + j];
		done[dstIndex] = 1;
	}
}
/**
* Internal variant of {@link compactPrimitive}'s index remapping. Avoids
* cloning indices; writes directly to `dstIndices`.
* @hidden
* @internal
*/
function remapIndices(srcIndices, remap, dstIndices, dstOffset) {
	const srcCount = srcIndices.getCount();
	const srcArray = srcIndices.getArray();
	const dstArray = dstIndices.getArray();
	const srcRestart = getPrimitiveRestartIndex(srcIndices.getComponentType());
	const dstRestart = getPrimitiveRestartIndex(dstIndices.getComponentType());
	for (let i = 0; i < srcCount; i++) {
		const srcIndex = srcArray[i];
		if (srcIndex === srcRestart) dstArray[dstOffset + i] = dstRestart;
		else {
			const dstIndex = remap[srcIndex];
			dstArray[dstOffset + i] = dstIndex;
		}
	}
}
//#endregion
//#region src/join.ts
const NAME$18 = "join";
const { ROOT, NODE, MESH, PRIMITIVE, ACCESSOR } = PropertyType;
const _matrix = [
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0
];
const JOIN_DEFAULTS = {
	keepMeshes: false,
	keepNamed: false,
	cleanup: true,
	filter: () => true
};
/**
* Joins compatible {@link Primitive Primitives} and reduces draw calls.
* Primitives are eligible for joining if they are members of the same
* {@link Mesh} or, optionally, attached to sibling {@link Node Nodes}
* in the scene hierarchy. For best results, apply {@link dedup} and
* {@link flatten} first to maximize the number of Primitives that
* can be joined.
*
* NOTE: In a Scene that heavily reuses the same Mesh data, joining may
* increase vertex count. Consider alternatives, like
* {@link instance instancing} with {@link EXTMeshGPUInstancing}.
*
* Example:
*
* ```ts
* import { PropertyType } from '@gltf-transform/core';
* import { join, flatten, dedup } from '@gltf-transform/functions';
*
* await document.transform(
* 	dedup({ propertyTypes: [PropertyType.MATERIAL] }),
* 	flatten(),
* 	join({ keepNamed: false }),
* );
* ```
*
* @category Transforms
*/
function join(_options = JOIN_DEFAULTS) {
	const options = assignDefaults(JOIN_DEFAULTS, _options);
	return createTransform(NAME$18, async (document) => {
		const root = document.getRoot();
		const logger = document.getLogger();
		const srcRestartModeCount = _getPrimRestartModeCount(document);
		for (const scene of root.listScenes()) {
			_joinLevel(document, scene, options);
			scene.traverse((node) => _joinLevel(document, node, options));
		}
		if (_getPrimRestartModeCount(document) < srcRestartModeCount) document.createExtension(KHRMeshPrimitiveRestart).setRequired(true);
		if (options.cleanup) await document.transform(prune({
			propertyTypes: [
				NODE,
				MESH,
				PRIMITIVE,
				ACCESSOR
			],
			keepAttributes: true,
			keepIndices: true,
			keepLeaves: false
		}));
		logger.debug(`${NAME$18}: Complete.`);
	});
}
function _joinLevel(document, parent, options) {
	const logger = document.getLogger();
	const groups = {};
	const children = parent.listChildren();
	for (let nodeIndex = 0; nodeIndex < children.length; nodeIndex++) {
		const node = children[nodeIndex];
		if (!options.filter(node)) continue;
		if (node.listParents().some((p) => p instanceof AnimationChannel)) continue;
		const mesh = node.getMesh();
		if (!mesh) continue;
		if (node.getExtension("EXT_mesh_gpu_instancing")) continue;
		if (node.getSkin()) continue;
		for (const prim of mesh.listPrimitives()) {
			if (prim.listTargets().length > 0) continue;
			const material = prim.getMaterial();
			if (material && material.getExtension("KHR_materials_volume")) continue;
			compactPrimitive(prim);
			dequantizeTransformableAttributes(prim);
			let key = createPrimGroupKey(prim);
			const isNamed = mesh.getName() || node.getName();
			if (options.keepMeshes || options.keepNamed && isNamed) key += `|${nodeIndex}`;
			if (!(key in groups)) groups[key] = {
				prims: [],
				primMeshes: [],
				primNodes: [],
				dstNode: node,
				dstMesh: void 0
			};
			const group = groups[key];
			group.prims.push(prim);
			group.primNodes.push(node);
		}
	}
	const joinGroups = Object.values(groups).filter(({ prims }) => prims.length > 1);
	const srcNodes = new Set(joinGroups.flatMap((group) => group.primNodes));
	for (const node of srcNodes) {
		const mesh = node.getMesh();
		if (mesh.listParents().some((parent) => {
			return parent.propertyType !== ROOT && node !== parent;
		})) node.setMesh(mesh.clone());
	}
	for (const group of joinGroups) {
		const { dstNode, primNodes } = group;
		group.dstMesh = dstNode.getMesh();
		group.primMeshes = primNodes.map((node) => node.getMesh());
	}
	for (const group of joinGroups) {
		const { prims, primNodes, primMeshes, dstNode, dstMesh } = group;
		const dstMatrix = dstNode.getMatrix();
		for (let i = 0; i < prims.length; i++) {
			const primNode = primNodes[i];
			const primMesh = primMeshes[i];
			let prim = prims[i];
			primMesh.removePrimitive(prim);
			if (isUsed(prim)) prim = prims[i] = _deepClonePrimitive(prims[i]);
			if (primNode !== dstNode) {
				multiply$2(_matrix, invert$1(_matrix, dstMatrix), primNode.getMatrix());
				transformPrimitive(prim, _matrix);
			}
		}
		const dstPrim = joinPrimitives(prims);
		const dstVertexCount = dstPrim.listAttributes()[0].getCount();
		dstMesh.addPrimitive(dstPrim);
		logger.debug(`${NAME$18}: Joined Primitives (${prims.length}) containing ${formatLong(dstVertexCount)} vertices under Node "${dstNode.getName()}".`);
	}
}
function _deepClonePrimitive(src) {
	const dst = src.clone();
	for (const semantic of dst.listSemantics()) dst.setAttribute(semantic, dst.getAttribute(semantic).clone());
	const indices = dst.getIndices();
	if (indices) dst.setIndices(indices.clone());
	return dst;
}
/**
* Returns the number of primitives in the document with draw modes compatible
* with primitive restart (KHR_mesh_primitive_restart).
*/
function _getPrimRestartModeCount(document) {
	let count = 0;
	for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) if (isPrimitiveRestartMode(prim.getMode())) count++;
	return count;
}
/**
* Dequantize attributes that would be affected by {@link transformPrimitive},
* to avoid invalidating our primitive group keys.
*
* See: https://github.com/donmccurdy/glTF-Transform/issues/844
*/
function dequantizeTransformableAttributes(prim) {
	for (const semantic of [
		"POSITION",
		"NORMAL",
		"TANGENT"
	]) {
		const attribute = prim.getAttribute(semantic);
		if (attribute) dequantizeAttribute(attribute);
	}
}
//#endregion
//#region src/list-texture-channels.ts
/**
* Returns a list of {@link TextureChannel TextureChannels} used by the given
* texture. Determination is based only on the _role_ of the textures, e.g.
* a texture used for the `occlusionTexture` will have (at least) a red channel
* in use. See {@link getTextureChannelMask} for bitmask alternative.
*
* Example:
*
* ```js
* const channels = listTextureChannels(texture);
* if (channels.includes(TextureChannel.R)) {
*   console.log('texture red channel used');
* }
* ```
*/
function listTextureChannels(texture) {
	const mask = getTextureChannelMask(texture);
	const channels = [];
	if (mask & TextureChannel.R) channels.push(TextureChannel.R);
	if (mask & TextureChannel.G) channels.push(TextureChannel.G);
	if (mask & TextureChannel.B) channels.push(TextureChannel.B);
	if (mask & TextureChannel.A) channels.push(TextureChannel.A);
	return channels;
}
/**
* Returns bitmask of all {@link TextureChannel TextureChannels} used by the
* given texture. Determination is based only on the _role_ of the textures, e.g.
* a texture used for the `occlusionTexture` will have (at least) a red channel.
* See {@link listTextureChannels} for an array alternative.
*
* Example:
*
* ```js
* const mask = getTextureChannelMask(texture);
* if (mask & TextureChannel.R) {
*   console.log('texture red channel used');
* }
* ```
*/
function getTextureChannelMask(texture) {
	const document = Document.fromGraph(texture.getGraph());
	let mask = 0;
	for (const edge of document.getGraph().listParentEdges(texture)) {
		const parent = edge.getParent();
		let { channels } = edge.getAttributes();
		if (channels && edge.getName() === "baseColorTexture" && parent instanceof Material && parent.getAlphaMode() === Material.AlphaMode.OPAQUE) channels &= ~TextureChannel.A;
		if (channels) {
			mask |= channels;
			continue;
		}
		if (parent.propertyType !== PropertyType.ROOT) document.getLogger().warn(`Missing attribute ".channels" on edge, "${edge.getName()}".`);
	}
	return mask;
}
//#endregion
//#region src/sort-primitive-weights.ts
/**
* Sorts skinning weights from high to low, for each vertex of the input
* {@link Primitive} or {@link PrimitiveTarget}, and normalizes the weights.
* Optionally, uses the given 'limit' to remove least-significant joint
* influences such that no vertex has more than 'limit' influences.
*
* Most realtime engines support a limited number of joint influences per vertex,
* often 4 or 8. Sorting and removing the additional influences can reduce file
* size and improve compatibility.
*
* Example:
*
* ```javascript
* import { sortPrimitiveWeights } from '@gltf-transform/functions';
*
* const limit = 4;
* for (const mesh of document.getRoot().listMeshes()) {
* 	for (const prim of mesh.listPrimitives()) {
* 		sortPrimitiveWeights(prim, limit);
* 	}
* }
* ```
*
* @param prim Input, to be modified in place.
* @param limit Maximum number of joint influences per vertex. Must be a multiple of four.
*/
function sortPrimitiveWeights(prim, limit = Infinity) {
	if (Number.isFinite(limit) && limit % 4 || limit <= 0) throw new Error(`Limit must be positive multiple of four.`);
	const vertexCount = prim.getAttribute("POSITION").getCount();
	const setCount = prim.listSemantics().filter((name) => name.startsWith("WEIGHTS_")).length;
	const indices = new Uint16Array(setCount * 4);
	const srcWeights = new Float32Array(setCount * 4);
	const dstWeights = new Float32Array(setCount * 4);
	const srcJoints = new Uint32Array(setCount * 4);
	const dstJoints = new Uint32Array(setCount * 4);
	for (let i = 0; i < vertexCount; i++) {
		getVertexArray(prim, i, "WEIGHTS", srcWeights);
		getVertexArray(prim, i, "JOINTS", srcJoints);
		for (let j = 0; j < setCount * 4; j++) indices[j] = j;
		indices.sort((a, b) => srcWeights[a] > srcWeights[b] ? -1 : 1);
		for (let j = 0; j < indices.length; j++) {
			dstWeights[j] = srcWeights[indices[j]];
			dstJoints[j] = srcJoints[indices[j]];
		}
		setVertexArray(prim, i, "WEIGHTS", dstWeights);
		setVertexArray(prim, i, "JOINTS", dstJoints);
	}
	for (let i = setCount; i * 4 > limit; i--) {
		const weights = prim.getAttribute(`WEIGHTS_${i - 1}`);
		const joints = prim.getAttribute(`JOINTS_${i - 1}`);
		prim.setAttribute(`WEIGHTS_${i - 1}`, null);
		prim.setAttribute(`JOINTS_${i - 1}`, null);
		if (weights.listParents().length === 1) weights.dispose();
		if (joints.listParents().length === 1) joints.dispose();
	}
	normalizePrimitiveWeights(prim);
}
function normalizePrimitiveWeights(prim) {
	if (!isNormalizeSafe(prim)) return;
	const vertexCount = prim.getAttribute("POSITION").getCount();
	const setCount = prim.listSemantics().filter((name) => name.startsWith("WEIGHTS_")).length;
	const templateAttribute = prim.getAttribute("WEIGHTS_0");
	const templateArray = templateAttribute.getArray();
	const componentType = templateAttribute.getComponentType();
	const normalized = templateAttribute.getNormalized();
	const normalizedComponentType = normalized ? componentType : void 0;
	const delta = normalized ? MathUtils.decodeNormalizedInt(1, componentType) : Number.EPSILON;
	const joints = new Uint32Array(setCount * 4).fill(0);
	const weights = templateArray.slice(0, setCount * 4).fill(0);
	for (let i = 0; i < vertexCount; i++) {
		getVertexArray(prim, i, "JOINTS", joints);
		getVertexArray(prim, i, "WEIGHTS", weights, normalizedComponentType);
		let weightsSum = sum(weights, normalizedComponentType);
		if (weightsSum !== 0 && weightsSum !== 1) {
			if (Math.abs(1 - weightsSum) > delta) for (let j = 0; j < weights.length; j++) if (normalized) {
				const floatValue = MathUtils.decodeNormalizedInt(weights[j], componentType);
				weights[j] = MathUtils.encodeNormalizedInt(floatValue / weightsSum, componentType);
			} else weights[j] /= weightsSum;
			weightsSum = sum(weights, normalizedComponentType);
			if (normalized && weightsSum !== 1) {
				for (let j = weights.length - 1; j >= 0; j--) if (weights[j] > 0) {
					const delta = 1 - weightsSum;
					weights[j] += Math.sign(delta) * MathUtils.encodeNormalizedInt(Math.abs(delta), componentType);
					break;
				}
			}
		}
		for (let j = weights.length - 1; j >= 0; j--) if (weights[j] === 0) joints[j] = 0;
		setVertexArray(prim, i, "JOINTS", joints);
		setVertexArray(prim, i, "WEIGHTS", weights, normalizedComponentType);
	}
}
/** Lists all values of a multi-set vertex attribute (WEIGHTS_#, ...) for given vertex. */
function getVertexArray(prim, vertexIndex, prefix, target, normalizedComponentType) {
	let weights;
	const el = [
		0,
		0,
		0,
		0
	];
	for (let i = 0; weights = prim.getAttribute(`${prefix}_${i}`); i++) {
		weights.getElement(vertexIndex, el);
		for (let j = 0; j < 4; j++) if (normalizedComponentType) target[i * 4 + j] = MathUtils.encodeNormalizedInt(el[j], normalizedComponentType);
		else target[i * 4 + j] = el[j];
	}
	return target;
}
/** Sets all values of a multi-set vertex attribute (WEIGHTS_#, ...) for given vertex. */
function setVertexArray(prim, vertexIndex, prefix, values, normalizedComponentType) {
	let weights;
	const el = [
		0,
		0,
		0,
		0
	];
	for (let i = 0; weights = prim.getAttribute(`${prefix}_${i}`); i++) {
		for (let j = 0; j < 4; j++) if (normalizedComponentType) el[j] = MathUtils.decodeNormalizedInt(values[i * 4 + j], normalizedComponentType);
		else el[j] = values[i * 4 + j];
		weights.setElement(vertexIndex, el);
	}
}
/** Sum an array of numbers. */
function sum(values, normalizedComponentType) {
	let sum = 0;
	for (let i = 0; i < values.length; i++) if (normalizedComponentType) sum += MathUtils.decodeNormalizedInt(values[i], normalizedComponentType);
	else sum += values[i];
	return sum;
}
/** Returns true if attribute normalization is supported for this primitive. */
function isNormalizeSafe(prim) {
	const attributes = prim.listSemantics().filter((name) => name.startsWith("WEIGHTS_")).map((name) => prim.getAttribute(name));
	const normList = attributes.map((a) => a.getNormalized());
	const typeList = attributes.map((a) => a.getComponentType());
	return new Set(normList).size === 1 && new Set(typeList).size === 1;
}
//#endregion
//#region src/quantize.ts
const NAME$17 = "quantize";
const SIGNED_INT = [
	Int8Array,
	Int16Array,
	Int32Array
];
const { TRANSLATION, ROTATION, SCALE, WEIGHTS } = AnimationChannel.TargetPath;
const TRS_CHANNELS = [
	TRANSLATION,
	ROTATION,
	SCALE
];
const QUANTIZE_DEFAULTS = {
	pattern: /.*/,
	quantizationVolume: "mesh",
	quantizePosition: 14,
	quantizeNormal: 10,
	quantizeTexcoord: 12,
	quantizeColor: 8,
	quantizeWeight: 8,
	quantizeGeneric: 12,
	normalizeWeights: true,
	cleanup: true
};
/**
* References:
* - https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_mesh_quantization
* - http://www.aclockworkberry.com/normal-unpacking-quantization-errors/
* - https://www.mathworks.com/help/dsp/ref/uniformencoder.html
* - https://oroboro.com/compressed-unit-vectors/
*/
/**
* Quantizes vertex attributes with `KHR_mesh_quantization`, reducing the size and memory footprint
* of the file. Conceptually, quantization refers to snapping values to regular intervals; vertex
* positions are snapped to a 3D grid, UVs to a 2D grid, and so on. When quantized to <= 16 bits,
* larger component types may be more compactly stored as 16-bit or 8-bit attributes.
*
* Often, it can be useful to quantize to precision lower than the maximum allowed by the component
* type. Positions quantized to 14 bits in a 16-bit accessor will occupy 16 bits in VRAM, but they
* can be compressed further for network compression with lossless encodings such as ZSTD.
*
* Vertex positions are shifted into [-1,1] or [0,1] range before quantization. Compensating for
* that shift, a transform is applied to the parent {@link Node}, or inverse bind matrices for a
* {@link Skin} if applicable. Materials using {@link KHRMaterialsVolume} are adjusted to maintain
* appearance. In future releases, UVs may also be transformed with {@link KHRTextureTransform}.
* Currently UVs outside of [0,1] range are not quantized.
*
* In most cases, quantization requires {@link KHRMeshQuantization}; the extension will be added
* automatically when `quantize()` is applied. When applying meshopt compression with
* {@link EXTMeshoptCompression}, quantization is usually applied before compression.
*
* Example:
*
* ```javascript
* import { quantize } from '@gltf-transform/functions';
*
* await document.transform(
*   quantize({
*		quantizePosition: 14,
*		quantizeNormal: 10,
*   }),
* );
* ```
*
* For the inverse operation, see {@link dequantize}.
*
* @category Transforms
*/
function quantize(_options = QUANTIZE_DEFAULTS) {
	const options = assignDefaults(QUANTIZE_DEFAULTS, {
		patternTargets: _options.pattern || QUANTIZE_DEFAULTS.pattern,
		..._options
	});
	return createTransform(NAME$17, async (document) => {
		const logger = document.getLogger();
		const root = document.getRoot();
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("quantize: Missing support for KHR_mesh_primitive_restart.");
		let nodeTransform;
		if (options.quantizationVolume === "scene") nodeTransform = getNodeTransform(expandBounds(root.listMeshes().map(getPositionQuantizationVolume)));
		for (const mesh of document.getRoot().listMeshes()) {
			if (options.quantizationVolume === "mesh") nodeTransform = getNodeTransform(getPositionQuantizationVolume(mesh));
			if (nodeTransform && options.pattern.test("POSITION")) {
				transformMeshParents(document, mesh, nodeTransform);
				transformMeshMaterials(mesh, 1 / nodeTransform.scale);
			}
			for (const prim of mesh.listPrimitives()) {
				if (getPrimitiveVertexCount(prim, "render") < getPrimitiveVertexCount(prim, "upload") / 2) compactPrimitive(prim);
				quantizePrimitive(document, prim, nodeTransform, options);
				for (const target of prim.listTargets()) quantizePrimitive(document, target, nodeTransform, options);
			}
		}
		if (root.listMeshes().flatMap((mesh) => mesh.listPrimitives()).some(isQuantizedPrimitive)) document.createExtension(KHRMeshQuantization).setRequired(true);
		if (options.cleanup) await document.transform(prune({
			propertyTypes: [
				PropertyType.ACCESSOR,
				PropertyType.SKIN,
				PropertyType.MATERIAL
			],
			keepAttributes: true,
			keepIndices: true,
			keepLeaves: true,
			keepSolidTextures: true
		}), dedup({
			propertyTypes: [
				PropertyType.ACCESSOR,
				PropertyType.MATERIAL,
				PropertyType.SKIN
			],
			keepUniqueNames: true
		}));
		logger.debug(`${NAME$17}: Complete.`);
	});
}
function quantizePrimitive(document, prim, nodeTransform, options) {
	const isTarget = prim instanceof PrimitiveTarget;
	const logger = document.getLogger();
	for (const semantic of prim.listSemantics()) {
		if (!isTarget && !options.pattern.test(semantic)) continue;
		if (isTarget && !options.patternTargets.test(semantic)) continue;
		const srcAttribute = prim.getAttribute(semantic);
		const { bits, ctor } = getQuantizationSettings(semantic, srcAttribute, logger, options);
		if (!ctor) continue;
		if (bits < 8 || bits > 16) throw new Error(`${NAME$17}: Requires bits = 8–16.`);
		if (srcAttribute.getComponentSize() <= bits / 8) continue;
		const dstAttribute = srcAttribute.clone();
		if (semantic === "POSITION") {
			const scale = nodeTransform.scale;
			const transform = [];
			prim instanceof Primitive ? invert$1(transform, fromTransform(nodeTransform)) : fromScaling(transform, [
				1 / scale,
				1 / scale,
				1 / scale
			]);
			for (let i = 0, el = [
				0,
				0,
				0
			], il = dstAttribute.getCount(); i < il; i++) {
				dstAttribute.getElement(i, el);
				dstAttribute.setElement(i, transformMat4(el, el, transform));
			}
		}
		quantizeAttribute(dstAttribute, ctor, bits);
		prim.setAttribute(semantic, dstAttribute);
	}
	if (options.normalizeWeights && prim.getAttribute("WEIGHTS_0")) sortPrimitiveWeights(prim, Infinity);
	if (prim instanceof Primitive && prim.getIndices() && prim.listAttributes().length && prim.listAttributes()[0].getCount() < 65535) {
		const indices = prim.getIndices();
		indices.setArray(new Uint16Array(indices.getArray()));
	}
}
/** Computes node quantization transforms in local space. */
function getNodeTransform(volume) {
	const { min, max } = volume;
	const scale = Math.max((max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2);
	return {
		offset: [
			min[0] + (max[0] - min[0]) / 2,
			min[1] + (max[1] - min[1]) / 2,
			min[2] + (max[2] - min[2]) / 2
		],
		scale
	};
}
/** Applies corrective scale and offset to nodes referencing a quantized Mesh. */
function transformMeshParents(document, mesh, nodeTransform) {
	const transformMatrix = fromTransform(nodeTransform);
	for (const parent of mesh.listParents()) {
		if (!(parent instanceof Node)) continue;
		const animChannels = parent.listParents().filter((p) => p instanceof AnimationChannel);
		const isAnimated = animChannels.some((channel) => TRS_CHANNELS.includes(channel.getTargetPath()));
		const isParentNode = parent.listChildren().length > 0;
		const skin = parent.getSkin();
		if (skin) {
			parent.setSkin(transformSkin(skin, nodeTransform));
			continue;
		}
		const batch = parent.getExtension("EXT_mesh_gpu_instancing");
		if (batch) {
			parent.setExtension("EXT_mesh_gpu_instancing", transformBatch(document, batch, nodeTransform));
			continue;
		}
		let targetNode;
		if (isParentNode || isAnimated) {
			targetNode = document.createNode("").setMesh(mesh);
			parent.addChild(targetNode).setMesh(null);
			animChannels.filter((channel) => channel.getTargetPath() === WEIGHTS).forEach((channel) => channel.setTargetNode(targetNode));
		} else targetNode = parent;
		const nodeMatrix = targetNode.getMatrix();
		multiply$2(nodeMatrix, nodeMatrix, transformMatrix);
		targetNode.setMatrix(nodeMatrix);
	}
}
/** Applies corrective scale and offset to skin IBMs. */
function transformSkin(skin, nodeTransform) {
	skin = skin.clone();
	const transformMatrix = fromTransform(nodeTransform);
	const inverseBindMatrices = skin.getInverseBindMatrices().clone();
	const ibm = [];
	for (let i = 0, count = inverseBindMatrices.getCount(); i < count; i++) {
		inverseBindMatrices.getElement(i, ibm);
		multiply$2(ibm, ibm, transformMatrix);
		inverseBindMatrices.setElement(i, ibm);
	}
	return skin.setInverseBindMatrices(inverseBindMatrices);
}
/** Applies corrective scale and offset to GPU instancing batches. */
function transformBatch(document, batch, nodeTransform) {
	if (!batch.getAttribute("TRANSLATION") && !batch.getAttribute("ROTATION") && !batch.getAttribute("SCALE")) return batch;
	batch = batch.clone();
	let instanceTranslation = batch.getAttribute("TRANSLATION")?.clone();
	const instanceRotation = batch.getAttribute("ROTATION")?.clone();
	let instanceScale = batch.getAttribute("SCALE")?.clone();
	const tpl = instanceTranslation || instanceRotation || instanceScale;
	const T_IDENTITY = [
		0,
		0,
		0
	];
	const R_IDENTITY = [
		0,
		0,
		0,
		1
	];
	const S_IDENTITY = [
		1,
		1,
		1
	];
	if (!instanceTranslation && nodeTransform.offset) instanceTranslation = document.createAccessor().setType("VEC3").setArray(makeArray(tpl.getCount(), T_IDENTITY));
	if (!instanceScale && nodeTransform.scale) instanceScale = document.createAccessor().setType("VEC3").setArray(makeArray(tpl.getCount(), S_IDENTITY));
	const t = [
		0,
		0,
		0
	];
	const r = [
		0,
		0,
		0,
		1
	];
	const s = [
		1,
		1,
		1
	];
	const instanceMatrix = [
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1,
		0,
		0,
		0,
		0,
		1
	];
	const transformMatrix = fromTransform(nodeTransform);
	for (let i = 0, count = tpl.getCount(); i < count; i++) {
		MathUtils.compose(instanceTranslation ? instanceTranslation.getElement(i, t) : T_IDENTITY, instanceRotation ? instanceRotation.getElement(i, r) : R_IDENTITY, instanceScale ? instanceScale.getElement(i, s) : S_IDENTITY, instanceMatrix);
		multiply$2(instanceMatrix, instanceMatrix, transformMatrix);
		MathUtils.decompose(instanceMatrix, t, r, s);
		if (instanceTranslation) instanceTranslation.setElement(i, t);
		if (instanceRotation) instanceRotation.setElement(i, r);
		if (instanceScale) instanceScale.setElement(i, s);
	}
	if (instanceTranslation) batch.setAttribute("TRANSLATION", instanceTranslation);
	if (instanceRotation) batch.setAttribute("ROTATION", instanceRotation);
	if (instanceScale) batch.setAttribute("SCALE", instanceScale);
	return batch;
}
/** Applies corrective scale to volumetric materials, which give thickness in local units. */
function transformMeshMaterials(mesh, scale) {
	for (const prim of mesh.listPrimitives()) {
		let material = prim.getMaterial();
		if (!material) continue;
		let volume = material.getExtension("KHR_materials_volume");
		if (!volume || volume.getThicknessFactor() <= 0) continue;
		volume = volume.clone().setThicknessFactor(volume.getThicknessFactor() * scale);
		material = material.clone().setExtension("KHR_materials_volume", volume);
		prim.setMaterial(material);
	}
}
/**
* Quantizes an attribute to the given parameters.
*
* Uniformly remap 32-bit floats to reduced-precision 8- or 16-bit integers, so
* that there are only 2^N unique values, for N within [8, 16].
*
* See: https://github.com/donmccurdy/glTF-Transform/issues/208
*/
function quantizeAttribute(attribute, ctor, bits) {
	const dstArray = new ctor(attribute.getArray().length);
	const signBits = SIGNED_INT.includes(ctor) ? 1 : 0;
	const quantBits = bits - signBits;
	const storageBits = ctor.BYTES_PER_ELEMENT * 8 - signBits;
	const scale = Math.pow(2, quantBits) - 1;
	const lo = storageBits - quantBits;
	const hi = 2 * quantBits - storageBits;
	const range = [signBits > 0 ? -1 : 0, 1];
	for (let i = 0, di = 0, el = []; i < attribute.getCount(); i++) {
		attribute.getElement(i, el);
		for (let j = 0; j < el.length; j++) {
			let value = clamp(el[j], range);
			value = Math.round(Math.abs(value) * scale);
			value = value << lo | value >> hi;
			dstArray[di++] = value * Math.sign(el[j]);
		}
	}
	attribute.setArray(dstArray).setNormalized(true).setSparse(false);
}
function getQuantizationSettings(semantic, attribute, logger, options) {
	const min = attribute.getMinNormalized([]);
	const max = attribute.getMaxNormalized([]);
	let bits;
	let ctor;
	if (semantic === "POSITION") {
		bits = options.quantizePosition;
		ctor = bits <= 8 ? Int8Array : Int16Array;
	} else if (semantic === "NORMAL" || semantic === "TANGENT") {
		bits = options.quantizeNormal;
		ctor = bits <= 8 ? Int8Array : Int16Array;
	} else if (semantic.startsWith("COLOR_")) {
		bits = options.quantizeColor;
		ctor = bits <= 8 ? Uint8Array : Uint16Array;
	} else if (semantic.startsWith("TEXCOORD_")) {
		if (min.some((v) => v < 0) || max.some((v) => v > 1)) {
			logger.warn(`${NAME$17}: Skipping ${semantic}; out of [0,1] range.`);
			return { bits: -1 };
		}
		bits = options.quantizeTexcoord;
		ctor = bits <= 8 ? Uint8Array : Uint16Array;
	} else if (semantic.startsWith("JOINTS_")) {
		bits = Math.max(...attribute.getMax([])) <= 255 ? 8 : 16;
		ctor = bits <= 8 ? Uint8Array : Uint16Array;
		if (attribute.getComponentSize() > bits / 8) attribute.setArray(new ctor(attribute.getArray()));
		return { bits: -1 };
	} else if (semantic.startsWith("WEIGHTS_")) {
		if (min.some((v) => v < 0) || max.some((v) => v > 1)) {
			logger.warn(`${NAME$17}: Skipping ${semantic}; out of [0,1] range.`);
			return { bits: -1 };
		}
		bits = options.quantizeWeight;
		ctor = bits <= 8 ? Uint8Array : Uint16Array;
	} else if (semantic.startsWith("_")) {
		if (min.some((v) => v < -1) || max.some((v) => v > 1)) {
			logger.warn(`${NAME$17}: Skipping ${semantic}; out of [-1,1] range.`);
			return { bits: -1 };
		}
		bits = options.quantizeGeneric;
		ctor = min.some((v) => v < 0) ? ctor = bits <= 8 ? Int8Array : Int16Array : ctor = bits <= 8 ? Uint8Array : Uint16Array;
	} else throw new Error(`${NAME$17}: Unexpected semantic, "${semantic}".`);
	return {
		bits,
		ctor
	};
}
function getPositionQuantizationVolume(mesh) {
	const positions = [];
	const relativePositions = [];
	for (const prim of mesh.listPrimitives()) {
		const attribute = prim.getAttribute("POSITION");
		if (attribute) positions.push(attribute);
		for (const target of prim.listTargets()) {
			const attribute = target.getAttribute("POSITION");
			if (attribute) relativePositions.push(attribute);
		}
	}
	if (positions.length === 0) throw new Error(`${NAME$17}: Missing "POSITION" attribute.`);
	const bbox = flatBounds(positions, 3);
	if (relativePositions.length > 0) {
		const { min: relMin, max: relMax } = flatBounds(relativePositions, 3);
		min(bbox.min, bbox.min, min(relMin, scale$1(relMin, relMin, 2), [
			0,
			0,
			0
		]));
		max(bbox.max, bbox.max, max(relMax, scale$1(relMax, relMax, 2), [
			0,
			0,
			0
		]));
	}
	return bbox;
}
function isQuantizedAttribute(semantic, attribute) {
	const componentSize = attribute.getComponentSize();
	if (semantic === "POSITION") return componentSize < 4;
	if (semantic === "NORMAL") return componentSize < 4;
	if (semantic === "TANGENT") return componentSize < 4;
	if (semantic.startsWith("TEXCOORD_")) {
		const componentType = attribute.getComponentType();
		const normalized = attribute.getNormalized();
		return componentSize < 4 && !(normalized && componentType === Accessor.ComponentType.UNSIGNED_BYTE) && !(normalized && componentType === Accessor.ComponentType.UNSIGNED_SHORT);
	}
	return false;
}
function isQuantizedPrimitive(prim) {
	for (const semantic of prim.listSemantics()) if (isQuantizedAttribute(semantic, prim.getAttribute("POSITION"))) return true;
	if (prim.propertyType === PropertyType.PRIMITIVE) return prim.listTargets().some(isQuantizedPrimitive);
	return false;
}
/** Computes total min and max of all Accessors in a list. */
function flatBounds(accessors, elementSize) {
	const min = new Array(elementSize).fill(Infinity);
	const max = new Array(elementSize).fill(-Infinity);
	const tmpMin = [];
	const tmpMax = [];
	for (const accessor of accessors) {
		accessor.getMinNormalized(tmpMin);
		accessor.getMaxNormalized(tmpMax);
		for (let i = 0; i < elementSize; i++) {
			min[i] = Math.min(min[i], tmpMin[i]);
			max[i] = Math.max(max[i], tmpMax[i]);
		}
	}
	return {
		min,
		max
	};
}
function expandBounds(bboxes) {
	const result = bboxes[0];
	for (const bbox of bboxes) {
		min(result.min, result.min, bbox.min);
		max(result.max, result.max, bbox.max);
	}
	return result;
}
function fromTransform(transform) {
	return fromRotationTranslationScale([], [
		0,
		0,
		0,
		1
	], transform.offset, [
		transform.scale,
		transform.scale,
		transform.scale
	]);
}
function clamp(value, range) {
	return Math.min(Math.max(value, range[0]), range[1]);
}
function makeArray(elementCount, initialElement) {
	const elementSize = initialElement.length;
	const array = new Float32Array(elementCount * elementSize);
	for (let i = 0; i < elementCount; i++) array.set(initialElement, i * elementSize);
	return array;
}
//#endregion
//#region src/reorder.ts
const NAME$16 = "reorder";
const REORDER_DEFAULTS = {
	target: "size",
	cleanup: true
};
/**
* Optimizes {@link Mesh} {@link Primitive Primitives} for locality of reference. Choose whether
* the order should be optimal for transmission size (recommended for Web) or for GPU rendering
* performance. Requires a MeshoptEncoder instance from the Meshoptimizer library.
*
* Example:
*
* ```ts
* import { MeshoptEncoder } from 'meshoptimizer';
* import { reorder } from '@gltf-transform/functions';
*
* await MeshoptEncoder.ready;
*
* await document.transform(
* 	reorder({encoder: MeshoptEncoder})
* );
* ```
*
* @category Transforms
*/
function reorder(_options) {
	const options = assignDefaults(REORDER_DEFAULTS, _options);
	const encoder = options.encoder;
	if (!encoder) throw new Error(`${NAME$16}: encoder dependency required — install "meshoptimizer".`);
	return createTransform(NAME$16, async (document) => {
		const logger = document.getLogger();
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("reorder: Missing support for KHR_mesh_primitive_restart.");
		await encoder.ready;
		const plan = createLayoutPlan(document);
		for (const srcIndices of plan.indicesToAttributes.keys()) {
			let indicesArray = srcIndices.getArray();
			if (!(indicesArray instanceof Uint32Array)) indicesArray = new Uint32Array(indicesArray);
			else indicesArray = indicesArray.slice();
			const [remap, unique] = encoder.reorderMesh(indicesArray, plan.indicesToMode.get(srcIndices) === Primitive.Mode.TRIANGLES, options.target === "size");
			const dstIndices = shallowCloneAccessor(document, srcIndices);
			dstIndices.setArray(unique <= 65534 ? new Uint16Array(indicesArray) : indicesArray);
			for (const srcAttribute of plan.indicesToAttributes.get(srcIndices)) {
				const dstAttribute = shallowCloneAccessor(document, srcAttribute);
				compactAttribute(srcAttribute, srcIndices, remap, dstAttribute, unique);
				for (const prim of plan.indicesToPrimitives.get(srcIndices)) {
					if (prim.getIndices() === srcIndices) prim.swap(srcIndices, dstIndices);
					prim.swap(srcAttribute, dstAttribute);
					for (const target of prim.listTargets()) target.swap(srcAttribute, dstAttribute);
				}
			}
		}
		if (options.cleanup) await document.transform(prune({
			propertyTypes: [PropertyType.ACCESSOR],
			keepAttributes: true,
			keepIndices: true
		}));
		if (!plan.indicesToAttributes.size) logger.warn(`${NAME$16}: No qualifying primitives found; may need to weld first.`);
		else logger.debug(`${NAME$16}: Complete.`);
	});
}
/**
* Constructs a plan for processing vertex streams, based on unique
* index:attribute[] groups. Where different indices are used with the same
* attributes, we'll end up splitting the primitives to not share attributes,
* which appears to be consistent with the Meshopt implementation.
*
* @hidden
*/
function createLayoutPlan(document) {
	const indicesToMode = /* @__PURE__ */ new Map();
	const indicesToPrimitives = new SetMap();
	const indicesToAttributes = new SetMap();
	const attributesToPrimitives = new SetMap();
	for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
		const indices = prim.getIndices();
		if (!indices) continue;
		indicesToMode.set(indices, prim.getMode());
		indicesToPrimitives.add(indices, prim);
		for (const attribute of deepListAttributes(prim)) {
			indicesToAttributes.add(indices, attribute);
			attributesToPrimitives.add(attribute, prim);
		}
	}
	return {
		indicesToPrimitives,
		indicesToAttributes,
		indicesToMode,
		attributesToPrimitives
	};
}
//#endregion
//#region src/meshopt.ts
const MESHOPT_DEFAULTS = {
	level: "high",
	...QUANTIZE_DEFAULTS
};
const NAME$15 = "meshopt";
/**
* Applies Meshopt compression using {@link EXTMeshoptCompression EXT_meshopt_compression}.
* This type of compression can reduce the size of point, line, and triangle geometry,
* morph targets, and animation data.
*
* This function is a thin wrapper around {@link reorder}, {@link quantize}, and
* {@link EXTMeshoptCompression}, and exposes relatively few configuration options.
* To access more options (like quantization bits) direct use of the underlying
* functions is recommended.
*
* Example:
*
* ```javascript
* import { MeshoptEncoder } from 'meshoptimizer';
* import { meshopt } from '@gltf-transform/functions';
*
* await MeshoptEncoder.ready;
*
* await document.transform(
*   meshopt({encoder: MeshoptEncoder, level: 'medium'})
* );
* ```
*
* Compression is deferred until generating output with an I/O class.
*
* @category Transforms
*/
function meshopt(_options) {
	const options = assignDefaults(MESHOPT_DEFAULTS, _options);
	const encoder = options.encoder;
	if (!encoder) throw new Error(`${NAME$15}: encoder dependency required — install "meshoptimizer".`);
	return createTransform(NAME$15, async (document) => {
		let pattern;
		let patternTargets;
		let quantizeNormal = options.quantizeNormal;
		if (document.getRoot().listAccessors().length === 0) return;
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("meshopt: Missing support for KHR_mesh_primitive_restart.");
		if (options.level === "medium") {
			pattern = /.*/;
			patternTargets = /.*/;
		} else {
			pattern = /^(POSITION|TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/;
			patternTargets = /^(POSITION|TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/;
			quantizeNormal = Math.min(quantizeNormal, 8);
		}
		await document.transform(reorder({
			encoder,
			target: "size"
		}), quantize({
			...options,
			pattern,
			patternTargets,
			quantizeNormal
		}));
		document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: options.level === "medium" ? EXTMeshoptCompression.EncoderMethod.QUANTIZE : EXTMeshoptCompression.EncoderMethod.FILTER });
	});
}
//#endregion
//#region src/metal-rough.ts
const NAME$14 = "metalRough";
const METALROUGH_DEFAULTS = {};
/**
* Convert {@link Material}s from spec/gloss PBR workflow to metal/rough PBR workflow,
* removing `KHR_materials_pbrSpecularGlossiness` and adding `KHR_materials_ior` and
* `KHR_materials_specular`. The metal/rough PBR workflow is preferred for most use cases,
* and is a prerequisite for other advanced PBR extensions provided by glTF.
*
* No options are currently implemented for this function.
*
* @category Transforms
*/
function metalRough(_options = METALROUGH_DEFAULTS) {
	return createTransform(NAME$14, async (doc) => {
		const logger = doc.getLogger();
		if (!doc.getRoot().listExtensionsUsed().map((ext) => ext.extensionName).includes("KHR_materials_pbrSpecularGlossiness")) {
			logger.warn(`${NAME$14}: KHR_materials_pbrSpecularGlossiness not found on document.`);
			return;
		}
		const iorExtension = doc.createExtension(KHRMaterialsIOR);
		const specExtension = doc.createExtension(KHRMaterialsSpecular);
		const specGlossExtension = doc.createExtension(KHRMaterialsPBRSpecularGlossiness);
		const inputTextures = /* @__PURE__ */ new Set();
		for (const material of doc.getRoot().listMaterials()) {
			const specGloss = material.getExtension("KHR_materials_pbrSpecularGlossiness");
			if (!specGloss) continue;
			const specular = specExtension.createSpecular().setSpecularFactor(1).setSpecularColorFactor(specGloss.getSpecularFactor());
			inputTextures.add(specGloss.getSpecularGlossinessTexture());
			inputTextures.add(material.getBaseColorTexture());
			inputTextures.add(material.getMetallicRoughnessTexture());
			material.setBaseColorFactor(specGloss.getDiffuseFactor()).setMetallicFactor(0).setRoughnessFactor(1).setExtension("KHR_materials_ior", iorExtension.createIOR().setIOR(1e3)).setExtension("KHR_materials_specular", specular);
			const diffuseTexture = specGloss.getDiffuseTexture();
			if (diffuseTexture) {
				material.setBaseColorTexture(diffuseTexture);
				material.getBaseColorTextureInfo().copy(specGloss.getDiffuseTextureInfo());
			}
			const sgTexture = specGloss.getSpecularGlossinessTexture();
			if (sgTexture) {
				const sgTextureInfo = specGloss.getSpecularGlossinessTextureInfo();
				const specularTexture = doc.createTexture();
				await rewriteTexture(sgTexture, specularTexture, (pixels, i, j) => {
					pixels.set(i, j, 3, 255);
				});
				specular.setSpecularTexture(specularTexture);
				specular.setSpecularColorTexture(specularTexture);
				specular.getSpecularTextureInfo().copy(sgTextureInfo);
				specular.getSpecularColorTextureInfo().copy(sgTextureInfo);
				const glossinessFactor = specGloss.getGlossinessFactor();
				const metalRoughTexture = doc.createTexture();
				await rewriteTexture(sgTexture, metalRoughTexture, (pixels, i, j) => {
					const roughness = 255 - Math.round(pixels.get(i, j, 3) * glossinessFactor);
					pixels.set(i, j, 0, 0);
					pixels.set(i, j, 1, roughness);
					pixels.set(i, j, 2, 0);
					pixels.set(i, j, 3, 255);
				});
				material.setMetallicRoughnessTexture(metalRoughTexture);
				material.getMetallicRoughnessTextureInfo().copy(sgTextureInfo);
			} else {
				specular.setSpecularColorFactor(specGloss.getSpecularFactor());
				material.setRoughnessFactor(1 - specGloss.getGlossinessFactor());
			}
			material.setExtension("KHR_materials_pbrSpecularGlossiness", null);
		}
		specGlossExtension.dispose();
		for (const tex of inputTextures) if (tex && tex.listParents().length === 1) tex.dispose();
		logger.debug(`${NAME$14}: Complete.`);
	});
}
//#endregion
//#region src/unweld.ts
const NAME$13 = "unweld";
const UNWELD_DEFAULTS = {};
/**
* De-index {@link Primitive}s, disconnecting any shared vertices. This operation will generally
* increase the number of vertices in a mesh, but may be helpful for some geometry operations or
* for creating hard edges.
*
* No options are currently implemented for this function.
*
* @category Transforms
*/
function unweld(_options = UNWELD_DEFAULTS) {
	return createTransform(NAME$13, (doc) => {
		const logger = doc.getLogger();
		const visited = /* @__PURE__ */ new Map();
		for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) unweldPrimitive(prim, visited);
		logger.debug(`${NAME$13}: Complete.`);
	});
}
/**
* @hidden
* @internal
*/
function unweldPrimitive(prim, visited = /* @__PURE__ */ new Map()) {
	const indices = prim.getIndices();
	if (!indices) return;
	const graph = prim.getGraph();
	const document = Document.fromGraph(graph);
	const logger = document.getLogger();
	const srcVertexCount = prim.getAttribute("POSITION").getCount();
	for (const srcAttribute of prim.listAttributes()) {
		prim.swap(srcAttribute, unweldAttribute(document, srcAttribute, indices, visited));
		if (srcAttribute.listParents().length === 1) srcAttribute.dispose();
	}
	for (const target of prim.listTargets()) for (const srcAttribute of target.listAttributes()) {
		target.swap(srcAttribute, unweldAttribute(document, srcAttribute, indices, visited));
		if (srcAttribute.listParents().length === 1) srcAttribute.dispose();
	}
	const dstVertexCount = prim.getAttribute("POSITION").getCount();
	logger.debug(`${NAME$13}: ${formatDeltaOp(srcVertexCount, dstVertexCount)} vertices.`);
	prim.setIndices(null);
	if (indices.listParents().length === 1) indices.dispose();
}
function unweldAttribute(document, srcAttribute, indices, visited) {
	if (visited.has(srcAttribute) && visited.get(srcAttribute).has(indices)) return visited.get(srcAttribute).get(indices);
	const srcArray = srcAttribute.getArray();
	const TypedArray = srcArray.constructor;
	const dstArray = new TypedArray(indices.getCount() * srcAttribute.getElementSize());
	const indicesArray = indices.getArray();
	const elementSize = srcAttribute.getElementSize();
	for (let i = 0, il = indices.getCount(); i < il; i++) for (let j = 0; j < elementSize; j++) dstArray[i * elementSize + j] = srcArray[indicesArray[i] * elementSize + j];
	if (!visited.has(srcAttribute)) visited.set(srcAttribute, /* @__PURE__ */ new Map());
	const dstAttribute = shallowCloneAccessor(document, srcAttribute).setArray(dstArray);
	visited.get(srcAttribute).set(indices, dstAttribute);
	return dstAttribute;
}
//#endregion
//#region src/normals.ts
const NAME$12 = "normals";
const NORMALS_DEFAULTS = { overwrite: false };
/**
* Generates flat vertex normals for mesh primitives.
*
* Example:
*
* ```ts
* import { normals } from '@gltf-transform/functions';
*
* await document.transform(normals({overwrite: true}));
* ```
*
* @category Transforms
*/
function normals(_options = NORMALS_DEFAULTS) {
	const options = assignDefaults(NORMALS_DEFAULTS, _options);
	return createTransform(NAME$12, async (document) => {
		const logger = document.getLogger();
		let modified = 0;
		await document.transform(unweld());
		for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
			const position = prim.getAttribute("POSITION");
			let normal = prim.getAttribute("NORMAL");
			if (options.overwrite && normal) normal.dispose();
			else if (normal) {
				logger.debug(`${NAME$12}: Skipping primitive: NORMAL found.`);
				continue;
			}
			normal = document.createAccessor().setArray(new Float32Array(position.getCount() * 3)).setType("VEC3");
			const a = [
				0,
				0,
				0
			];
			const b = [
				0,
				0,
				0
			];
			const c = [
				0,
				0,
				0
			];
			for (let i = 0; i < position.getCount(); i += 3) {
				position.getElement(i + 0, a);
				position.getElement(i + 1, b);
				position.getElement(i + 2, c);
				const faceNormal = computeNormal(a, b, c);
				normal.setElement(i + 0, faceNormal);
				normal.setElement(i + 1, faceNormal);
				normal.setElement(i + 2, faceNormal);
			}
			prim.setAttribute("NORMAL", normal);
			modified++;
		}
		if (!modified) logger.warn(`${NAME$12}: No qualifying primitives found. See debug output.`);
		else logger.debug(`${NAME$12}: Complete.`);
	});
}
function computeNormal(a, b, c) {
	const A = [
		b[0] - a[0],
		b[1] - a[1],
		b[2] - a[2]
	];
	const B = [
		c[0] - a[0],
		c[1] - a[1],
		c[2] - a[2]
	];
	return normalize([
		0,
		0,
		0
	], [
		A[1] * B[2] - A[2] * B[1],
		A[2] * B[0] - A[0] * B[2],
		A[0] * B[1] - A[1] * B[0]
	]);
}
//#endregion
//#region src/palette.ts
const NAME$11 = "palette";
const PALETTE_DEFAULTS = {
	blockSize: 4,
	min: 5,
	keepAttributes: false,
	cleanup: true
};
/**
* Creates palette textures containing all unique values of scalar
* {@link Material} properties within the scene, then merges materials. For
* scenes with many solid-colored materials (often found in CAD, architectural,
* or low-poly styles), texture palettes can reduce the number of materials
* used, and significantly increase the number of {@link Mesh} objects eligible
* for {@link join} operations.
*
* Materials already containing texture coordinates (UVs) are not eligible for
* texture palette optimizations. Currently only a material's base color,
* alpha, emissive factor, metallic factor, and roughness factor are converted
* to palette textures.
*
* Example:
*
* ```typescript
* import { palette, flatten, dequantize, join } from '@gltf-transform/functions';
*
* await document.transform(
* 	palette({ min: 5 }),
* 	flatten(),
* 	dequantize(),
* 	join()
* );
* ```
*
* The illustration below shows a typical base color palette texture:
*
* <img
* 	src="/media/functions/palette.png"
* 	alt="Row of colored blocks"
* 	style="width: 100%; max-width: 320px; image-rendering: pixelated;">
*
* @category Transforms
*/
function palette(_options = PALETTE_DEFAULTS) {
	const options = assignDefaults(PALETTE_DEFAULTS, _options);
	const blockSize = Math.max(options.blockSize, 1);
	const min = Math.max(options.min, 1);
	return createTransform(NAME$11, async (document) => {
		const logger = document.getLogger();
		const root = document.getRoot();
		if (!options.keepAttributes) await document.transform(prune({
			propertyTypes: [PropertyType.ACCESSOR],
			keepAttributes: false,
			keepIndices: true,
			keepLeaves: true
		}));
		const prims = /* @__PURE__ */ new Set();
		const materials = /* @__PURE__ */ new Set();
		for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
			const material = prim.getMaterial();
			if (!material || !!prim.getAttribute("TEXCOORD_0")) continue;
			prims.add(prim);
			materials.add(material);
		}
		const materialKeys = /* @__PURE__ */ new Set();
		const materialKeyMap = /* @__PURE__ */ new Map();
		const materialProps = {
			baseColor: /* @__PURE__ */ new Set(),
			emissive: /* @__PURE__ */ new Set(),
			metallicRoughness: /* @__PURE__ */ new Set()
		};
		for (const material of materials) {
			const baseColor = encodeRGBA(material.getBaseColorFactor().slice());
			const emissive = encodeRGBA([...material.getEmissiveFactor(), 1]);
			const roughness = encodeFloat(material.getRoughnessFactor());
			const metallic = encodeFloat(material.getMetallicFactor());
			const key = `baseColor:${baseColor},emissive:${emissive},metallicRoughness:${metallic}${roughness}`;
			materialProps.baseColor.add(baseColor);
			materialProps.emissive.add(emissive);
			materialProps.metallicRoughness.add(metallic + "+" + roughness);
			materialKeys.add(key);
			materialKeyMap.set(material, key);
		}
		const keyCount = materialKeys.size;
		if (keyCount < min) {
			logger.debug(`${NAME$11}: Found <${min} unique material properties. Exiting.`);
			return;
		}
		const w = ceilPowerOfTwo(keyCount * blockSize);
		const h = ceilPowerOfTwo(blockSize);
		const padWidth = w - keyCount * blockSize;
		const paletteTexturePixels = {
			baseColor: null,
			emissive: null,
			metallicRoughness: null
		};
		const skipProps = /* @__PURE__ */ new Set(["name", "extras"]);
		const skip = (...props) => props.forEach((prop) => skipProps.add(prop));
		let baseColorTexture = null;
		let emissiveTexture = null;
		let metallicRoughnessTexture = null;
		if (materialProps.baseColor.size >= min) {
			const name = "PaletteBaseColor";
			baseColorTexture = document.createTexture(name).setURI(`${name}.png`);
			paletteTexturePixels.baseColor = ndarray(new Uint8Array(w * h * 4), [
				w,
				h,
				4
			]);
			skip("baseColorFactor", "baseColorTexture", "baseColorTextureInfo");
		}
		if (materialProps.emissive.size >= min) {
			const name = "PaletteEmissive";
			emissiveTexture = document.createTexture(name).setURI(`${name}.png`);
			paletteTexturePixels.emissive = ndarray(new Uint8Array(w * h * 4), [
				w,
				h,
				4
			]);
			skip("emissiveFactor", "emissiveTexture", "emissiveTextureInfo");
		}
		if (materialProps.metallicRoughness.size >= min) {
			const name = "PaletteMetallicRoughness";
			metallicRoughnessTexture = document.createTexture(name).setURI(`${name}.png`);
			paletteTexturePixels.metallicRoughness = ndarray(new Uint8Array(w * h * 4), [
				w,
				h,
				4
			]);
			skip("metallicFactor", "roughnessFactor", "metallicRoughnessTexture", "metallicRoughnessTextureInfo");
		}
		if (!(baseColorTexture || emissiveTexture || metallicRoughnessTexture)) {
			logger.debug(`${NAME$11}: No material property has >=${min} unique values. Exiting.`);
			return;
		}
		const visitedKeys = /* @__PURE__ */ new Set();
		const materialIndices = /* @__PURE__ */ new Map();
		const paletteMaterials = [];
		let nextIndex = 0;
		for (const material of materials) {
			const key = materialKeyMap.get(material);
			if (visitedKeys.has(key)) continue;
			const index = nextIndex++;
			if (paletteTexturePixels.baseColor) {
				const pixels = paletteTexturePixels.baseColor;
				const baseColor = [...material.getBaseColorFactor()];
				ColorUtils.convertLinearToSRGB(baseColor, baseColor);
				writeBlock(pixels, index, baseColor, blockSize);
			}
			if (paletteTexturePixels.emissive) {
				const pixels = paletteTexturePixels.emissive;
				const emissive = [...material.getEmissiveFactor(), 1];
				ColorUtils.convertLinearToSRGB(emissive, emissive);
				writeBlock(pixels, index, emissive, blockSize);
			}
			if (paletteTexturePixels.metallicRoughness) {
				const pixels = paletteTexturePixels.metallicRoughness;
				const metallic = material.getMetallicFactor();
				writeBlock(pixels, index, [
					0,
					material.getRoughnessFactor(),
					metallic,
					1
				], blockSize);
			}
			visitedKeys.add(key);
			materialIndices.set(key, index);
		}
		const mimeType = "image/png";
		if (baseColorTexture) {
			const image = await savePixels(paletteTexturePixels.baseColor, mimeType);
			baseColorTexture.setImage(image).setMimeType(mimeType);
		}
		if (emissiveTexture) {
			const image = await savePixels(paletteTexturePixels.emissive, mimeType);
			emissiveTexture.setImage(image).setMimeType(mimeType);
		}
		if (metallicRoughnessTexture) {
			const image = await savePixels(paletteTexturePixels.metallicRoughness, mimeType);
			metallicRoughnessTexture.setImage(image).setMimeType(mimeType);
		}
		let nextPaletteMaterialIndex = 1;
		for (const prim of prims) {
			const srcMaterial = prim.getMaterial();
			const key = materialKeyMap.get(srcMaterial);
			const padUV = (materialIndices.get(key) + .5) / keyCount * (w - padWidth) / w;
			const position = prim.getAttribute("POSITION");
			const buffer = position.getBuffer();
			const array = new Float32Array(position.getCount() * 2).fill(padUV);
			const uv = document.createAccessor().setType("VEC2").setArray(array).setBuffer(buffer);
			let dstMaterial;
			for (const material of paletteMaterials) if (material.equals(srcMaterial, skipProps)) dstMaterial = material;
			if (!dstMaterial) {
				const suffix = (nextPaletteMaterialIndex++).toString().padStart(3, "0");
				dstMaterial = srcMaterial.clone().setName(`PaletteMaterial${suffix}`);
				if (baseColorTexture) dstMaterial.setBaseColorFactor([
					1,
					1,
					1,
					1
				]).setBaseColorTexture(baseColorTexture).getBaseColorTextureInfo().setMinFilter(TextureInfo.MinFilter.NEAREST).setMagFilter(TextureInfo.MagFilter.NEAREST);
				if (emissiveTexture) dstMaterial.setEmissiveFactor([
					1,
					1,
					1
				]).setEmissiveTexture(emissiveTexture).getEmissiveTextureInfo().setMinFilter(TextureInfo.MinFilter.NEAREST).setMagFilter(TextureInfo.MagFilter.NEAREST);
				if (metallicRoughnessTexture) dstMaterial.setMetallicFactor(1).setRoughnessFactor(1).setMetallicRoughnessTexture(metallicRoughnessTexture).getMetallicRoughnessTextureInfo().setMinFilter(TextureInfo.MinFilter.NEAREST).setMagFilter(TextureInfo.MagFilter.NEAREST);
				paletteMaterials.push(dstMaterial);
			}
			prim.setMaterial(dstMaterial).setAttribute("TEXCOORD_0", uv);
		}
		if (options.cleanup) await document.transform(prune({ propertyTypes: [PropertyType.MATERIAL] }));
		logger.debug(`${NAME$11}: Complete.`);
	});
}
/** Encodes a floating-point value on the interval [0,1] at 8-bit precision. */
function encodeFloat(value) {
	const hex = Math.round(value * 255).toString(16);
	return hex.length === 1 ? "0" + hex : hex;
}
/** Encodes an RGBA color in Linear-sRGB-D65 color space. */
function encodeRGBA(value) {
	ColorUtils.convertLinearToSRGB(value, value);
	return value.map(encodeFloat).join("");
}
/** Returns the nearest higher power of two. */
function ceilPowerOfTwo(value) {
	return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}
/** Writes an NxN block of pixels to an image, at the given block index. */
function writeBlock(pixels, index, value, blockSize) {
	for (let i = 0; i < blockSize; i++) for (let j = 0; j < blockSize; j++) {
		pixels.set(index * blockSize + i, j, 0, value[0] * 255);
		pixels.set(index * blockSize + i, j, 1, value[1] * 255);
		pixels.set(index * blockSize + i, j, 2, value[2] * 255);
		pixels.set(index * blockSize + i, j, 3, value[3] * 255);
	}
}
//#endregion
//#region src/partition.ts
const NAME$10 = "partition";
const PARTITION_DEFAULTS = {
	animations: true,
	meshes: true
};
/**
* Partitions the binary payload of a glTF file so separate mesh or animation data is in separate
* `.bin` {@link Buffer}s. This technique may be useful for engines that support lazy-loading
* specific binary resources as needed over the application lifecycle.
*
* Example:
*
* ```ts
* document.getRoot().listBuffers(); // → [Buffer]
*
* await document.transform(partition({meshes: true}));
*
* document.getRoot().listBuffers(); // → [Buffer, Buffer, ...]
* ```
*
* @category Transforms
*/
function partition(_options = PARTITION_DEFAULTS) {
	const options = assignDefaults(PARTITION_DEFAULTS, _options);
	return createTransform(NAME$10, async (doc) => {
		const logger = doc.getLogger();
		if (options.meshes !== false) partitionMeshes(doc, logger, options);
		if (options.animations !== false) partitionAnimations(doc, logger, options);
		if (!options.meshes && !options.animations) logger.warn(`${NAME$10}: Select animations or meshes to create a partition.`);
		await doc.transform(prune({ propertyTypes: [PropertyType.BUFFER] }));
		logger.debug(`${NAME$10}: Complete.`);
	});
}
function partitionMeshes(doc, logger, options) {
	const existingURIs = new Set(doc.getRoot().listBuffers().map((b) => b.getURI()));
	doc.getRoot().listMeshes().forEach((mesh, meshIndex) => {
		if (Array.isArray(options.meshes) && !options.meshes.includes(mesh.getName())) {
			logger.debug(`${NAME$10}: Skipping mesh #${meshIndex} with name "${mesh.getName()}".`);
			return;
		}
		logger.debug(`${NAME$10}: Creating buffer for mesh "${mesh.getName()}".`);
		const buffer = doc.createBuffer(mesh.getName()).setURI(createBufferURI(mesh.getName() || "mesh", existingURIs));
		for (const prim of mesh.listPrimitives()) {
			prim.getIndices()?.setBuffer(buffer);
			for (const attribute of deepListAttributes(prim)) attribute.setBuffer(buffer);
		}
	});
}
function partitionAnimations(doc, logger, options) {
	const existingURIs = new Set(doc.getRoot().listBuffers().map((b) => b.getURI()));
	doc.getRoot().listAnimations().forEach((anim, animIndex) => {
		if (Array.isArray(options.animations) && !options.animations.includes(anim.getName())) {
			logger.debug(`${NAME$10}: Skipping animation #${animIndex} with name "${anim.getName()}".`);
			return;
		}
		logger.debug(`${NAME$10}: Creating buffer for animation "${anim.getName()}".`);
		const buffer = doc.createBuffer(anim.getName()).setURI(createBufferURI(anim.getName() || "animation", existingURIs));
		anim.listSamplers().forEach((sampler) => {
			const input = sampler.getInput();
			const output = sampler.getOutput();
			if (input) input.setBuffer(buffer);
			if (output) output.setBuffer(buffer);
		});
	});
}
const SANITIZE_BASENAME_RE = /[^\w0–9-]+/g;
function createBufferURI(basename, existing) {
	basename = basename.replace(SANITIZE_BASENAME_RE, "");
	let uri = `${basename}.bin`;
	let i = 1;
	while (existing.has(uri)) uri = `${basename}_${i++}.bin`;
	existing.add(uri);
	return uri;
}
//#endregion
//#region ../../node_modules/keyframe-resample/dist/keyframe-resample-browser.modern.js
var InterpolationInternal;
(function(InterpolationInternal) {
	InterpolationInternal[InterpolationInternal["STEP"] = 0] = "STEP";
	InterpolationInternal[InterpolationInternal["LERP"] = 1] = "LERP";
	InterpolationInternal[InterpolationInternal["SLERP"] = 2] = "SLERP";
})(InterpolationInternal || (InterpolationInternal = {}));
const EPSILON = 1e-6;
function resampleDebug(input, output, interpolation, tolerance = 1e-4) {
	const elementSize = output.length / input.length;
	const tmp = new Array(elementSize).fill(0);
	const value = new Array(elementSize).fill(0);
	const valueNext = new Array(elementSize).fill(0);
	const valuePrev = new Array(elementSize).fill(0);
	const lastIndex = input.length - 1;
	let writeIndex = 1;
	for (let i = 1; i < lastIndex; ++i) {
		const timePrev = input[writeIndex - 1];
		const time = input[i];
		const timeNext = input[i + 1];
		const t = (time - timePrev) / (timeNext - timePrev);
		let keep = false;
		if (time !== timeNext && (i !== 1 || time !== input[0])) {
			getElement(output, writeIndex - 1, valuePrev);
			getElement(output, i, value);
			getElement(output, i + 1, valueNext);
			if (interpolation === "slerp") {
				const sample = slerp(tmp, valuePrev, valueNext, t);
				const angle = getAngle(valuePrev, value) + getAngle(value, valueNext);
				keep = !eq(value, sample, tolerance) || angle + Number.EPSILON >= Math.PI;
			} else if (interpolation === "lerp") keep = !eq(value, vlerp(tmp, valuePrev, valueNext, t), tolerance);
			else if (interpolation === "step") keep = !eq(value, valuePrev) || !eq(value, valueNext);
		}
		if (keep) {
			if (i !== writeIndex) {
				input[writeIndex] = input[i];
				setElement(output, writeIndex, getElement(output, i, tmp));
			}
			writeIndex++;
		}
	}
	if (lastIndex > 0) {
		input[writeIndex] = input[lastIndex];
		setElement(output, writeIndex, getElement(output, lastIndex, tmp));
		writeIndex++;
	}
	return writeIndex;
}
function getElement(array, index, target) {
	for (let i = 0, elementSize = target.length; i < elementSize; i++) target[i] = array[index * elementSize + i];
	return target;
}
function setElement(array, index, value) {
	for (let i = 0, elementSize = value.length; i < elementSize; i++) array[index * elementSize + i] = value[i];
}
function eq(a, b, tolerance = 0) {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > tolerance) return false;
	return true;
}
function lerp(v0, v1, t) {
	return v0 * (1 - t) + v1 * t;
}
function vlerp(out, a, b, t) {
	for (let i = 0; i < a.length; i++) out[i] = lerp(a[i], b[i], t);
	return out;
}
function slerp(out, a, b, t) {
	let ax = a[0], ay = a[1], az = a[2], aw = a[3];
	let bx = b[0], by = b[1], bz = b[2], bw = b[3];
	let omega, cosom, sinom, scale0, scale1;
	cosom = ax * bx + ay * by + az * bz + aw * bw;
	if (cosom < 0) {
		cosom = -cosom;
		bx = -bx;
		by = -by;
		bz = -bz;
		bw = -bw;
	}
	if (1 - cosom > EPSILON) {
		omega = Math.acos(cosom);
		sinom = Math.sin(omega);
		scale0 = Math.sin((1 - t) * omega) / sinom;
		scale1 = Math.sin(t * omega) / sinom;
	} else {
		scale0 = 1 - t;
		scale1 = t;
	}
	out[0] = scale0 * ax + scale1 * bx;
	out[1] = scale0 * ay + scale1 * by;
	out[2] = scale0 * az + scale1 * bz;
	out[3] = scale0 * aw + scale1 * bw;
	return out;
}
function getAngle(a, b) {
	const dotproduct = dot(a, b);
	return Math.acos(2 * dotproduct * dotproduct - 1);
}
function dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}
//#endregion
//#region src/resample.ts
const NAME$9 = "resample";
const EMPTY_ARRAY = /* @__PURE__ */ new Float32Array(0);
const RESAMPLE_DEFAULTS = {
	ready: Promise.resolve(),
	resample: resampleDebug,
	tolerance: 1e-4,
	cleanup: true
};
/**
* Resample {@link AnimationChannel AnimationChannels}, losslessly deduplicating keyframes to
* reduce file size. Duplicate keyframes are commonly present in animation 'baked' by the
* authoring software to apply IK constraints or other software-specific features.
*
* Optionally, a WebAssembly implementation from the
* [`keyframe-resample`](https://github.com/donmccurdy/keyframe-resample-wasm) library may be
* provided. The WebAssembly version is usually much faster at processing large animation
* sequences, but may not be compatible with all runtimes and JavaScript build tools.
*
* Result: (0,0,0,0,1,1,1,0,0,0,0,0,0,0) → (0,0,1,1,0,0)
*
* Example:
*
* ```
* import { resample } from '@gltf-transform/functions';
* import { ready, resample as resampleWASM } from 'keyframe-resample';
*
* // JavaScript (slower)
* await document.transform(resample());
*
* // WebAssembly (faster)
* await document.transform(resample({ ready, resample: resampleWASM }));
* ```
*
* @privateRemarks Implementation based on THREE.KeyframeTrack#optimize().
* @category Transforms
*/
function resample(_options = RESAMPLE_DEFAULTS) {
	const options = assignDefaults(RESAMPLE_DEFAULTS, _options);
	return createTransform(NAME$9, async (document) => {
		const accessorsVisited = /* @__PURE__ */ new Set();
		const srcAccessorCount = document.getRoot().listAccessors().length;
		const logger = document.getLogger();
		const ready = options.ready;
		const resample = options.resample;
		await ready;
		for (const animation of document.getRoot().listAnimations()) {
			const samplerTargetPaths = /* @__PURE__ */ new Map();
			for (const channel of animation.listChannels()) samplerTargetPaths.set(channel.getSampler(), channel.getTargetPath());
			for (const sampler of animation.listSamplers()) {
				const samplerInterpolation = sampler.getInterpolation();
				if (samplerInterpolation === "STEP" || samplerInterpolation === "LINEAR") {
					const input = sampler.getInput();
					const output = sampler.getOutput();
					accessorsVisited.add(input);
					accessorsVisited.add(output);
					const tmpTimes = toFloat32Array(input.getArray(), input.getComponentType(), input.getNormalized());
					const tmpValues = toFloat32Array(output.getArray(), output.getComponentType(), output.getNormalized());
					const elementSize = tmpValues.length / tmpTimes.length;
					const srcCount = tmpTimes.length;
					let dstCount;
					if (samplerInterpolation === "STEP") dstCount = resample(tmpTimes, tmpValues, "step", options.tolerance);
					else if (samplerTargetPaths.get(sampler) === "rotation") dstCount = resample(tmpTimes, tmpValues, "slerp", options.tolerance);
					else dstCount = resample(tmpTimes, tmpValues, "lerp", options.tolerance);
					if (dstCount < srcCount) {
						const srcTimes = input.getArray();
						const srcValues = output.getArray();
						const dstTimes = fromFloat32Array(new Float32Array(tmpTimes.buffer, tmpTimes.byteOffset, dstCount), input.getComponentType(), input.getNormalized());
						const dstValues = fromFloat32Array(new Float32Array(tmpValues.buffer, tmpValues.byteOffset, dstCount * elementSize), output.getComponentType(), output.getNormalized());
						input.setArray(EMPTY_ARRAY);
						output.setArray(EMPTY_ARRAY);
						sampler.setInput(input.clone().setArray(dstTimes));
						sampler.setOutput(output.clone().setArray(dstValues));
						input.setArray(srcTimes);
						output.setArray(srcValues);
					}
				}
			}
		}
		for (const accessor of Array.from(accessorsVisited.values())) if (!accessor.listParents().some((p) => !(p instanceof Root))) accessor.dispose();
		if (document.getRoot().listAccessors().length > srcAccessorCount && options.cleanup) await document.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR] }));
		logger.debug(`${NAME$9}: Complete.`);
	});
}
/** Returns a copy of the source array, as a denormalized Float32Array. */
function toFloat32Array(srcArray, componentType, normalized) {
	if (srcArray instanceof Float32Array) return srcArray.slice();
	const dstArray = new Float32Array(srcArray);
	if (!normalized) return dstArray;
	for (let i = 0; i < dstArray.length; i++) dstArray[i] = MathUtils.decodeNormalizedInt(dstArray[i], componentType);
	return dstArray;
}
/** Returns a copy of the source array, with specified component type and normalization. */
function fromFloat32Array(srcArray, componentType, normalized) {
	if (componentType === Accessor.ComponentType.FLOAT) return srcArray.slice();
	const TypedArray = ComponentTypeToTypedArray[componentType];
	const dstArray = new TypedArray(srcArray.length);
	for (let i = 0; i < dstArray.length; i++) dstArray[i] = normalized ? MathUtils.encodeNormalizedInt(srcArray[i], componentType) : srcArray[i];
	return dstArray;
}
//#endregion
//#region src/sequence.ts
const NAME$8 = "sequence";
const SEQUENCE_DEFAULTS = {
	name: "",
	fps: 10,
	pattern: /.*/,
	sort: true
};
/**
* Creates an {@link Animation} displaying each of the specified {@link Node}s sequentially.
*
* @category Transforms
*/
function sequence(_options = SEQUENCE_DEFAULTS) {
	const options = assignDefaults(SEQUENCE_DEFAULTS, _options);
	return createTransform(NAME$8, (doc) => {
		const logger = doc.getLogger();
		const root = doc.getRoot();
		const fps = options.fps;
		const sequenceNodes = root.listNodes().filter((node) => node.getName().match(options.pattern));
		if (options.sort) sequenceNodes.sort((a, b) => a.getName() > b.getName() ? 1 : -1);
		const anim = doc.createAnimation(options.name);
		const animBuffer = root.listBuffers()[0];
		sequenceNodes.forEach((node, i) => {
			let inputArray;
			let outputArray;
			if (i === 0) {
				inputArray = [i / fps, (i + 1) / fps];
				outputArray = [
					1,
					1,
					1,
					0,
					0,
					0
				];
			} else if (i === sequenceNodes.length - 1) {
				inputArray = [(i - 1) / fps, i / fps];
				outputArray = [
					0,
					0,
					0,
					1,
					1,
					1
				];
			} else {
				inputArray = [
					(i - 1) / fps,
					i / fps,
					(i + 1) / fps
				];
				outputArray = [
					0,
					0,
					0,
					1,
					1,
					1,
					0,
					0,
					0
				];
			}
			const input = doc.createAccessor().setArray(new Float32Array(inputArray)).setBuffer(animBuffer);
			const output = doc.createAccessor().setArray(new Float32Array(outputArray)).setBuffer(animBuffer).setType(Accessor.Type.VEC3);
			const sampler = doc.createAnimationSampler().setInterpolation(AnimationSampler.Interpolation.STEP).setInput(input).setOutput(output);
			const channel = doc.createAnimationChannel().setTargetNode(node).setTargetPath(AnimationChannel.TargetPath.SCALE).setSampler(sampler);
			anim.addSampler(sampler).addChannel(channel);
		});
		logger.debug(`${NAME$8}: Complete.`);
	});
}
//#endregion
//#region src/simplify.ts
const NAME$7 = "simplify";
const { POINTS, LINES, LINE_STRIP, LINE_LOOP, TRIANGLES, TRIANGLE_STRIP, TRIANGLE_FAN } = Primitive.Mode;
const SIMPLIFY_DEFAULTS = {
	ratio: 0,
	error: 1e-4,
	lockBorder: false
};
/**
* Simplification algorithm, based on meshoptimizer, producing meshes with fewer
* triangles and vertices. Simplification is lossy, but the algorithm aims to
* preserve visual quality as much as possible for given parameters.
*
* The algorithm aims to reach the target 'ratio', while minimizing error. If
* error exceeds the specified 'error' threshold, the algorithm will quit
* before reaching the target ratio. Examples:
*
* - ratio=0.0, error=0.0001: Aims for maximum simplification, constrained to 0.01% error.
* - ratio=0.5, error=0.0001: Aims for 50% simplification, constrained to 0.01% error.
* - ratio=0.5, error=1: Aims for 50% simplification, unconstrained by error.
*
* Topology, particularly split vertices, will also limit the simplifier. For
* best results, apply a {@link weld} operation before simplification.
*
* Example:
*
* ```javascript
* import { simplify, weld } from '@gltf-transform/functions';
* import { MeshoptSimplifier } from 'meshoptimizer';
*
* await document.transform(
*   weld({}),
*   simplify({ simplifier: MeshoptSimplifier, ratio: 0.75, error: 0.001 })
* );
* ```
*
* References:
* - https://github.com/zeux/meshoptimizer/blob/master/js/README.md#simplifier
*
* @category Transforms
*/
function simplify(_options) {
	const options = assignDefaults(SIMPLIFY_DEFAULTS, _options);
	const simplifier = options.simplifier;
	if (!simplifier) throw new Error(`${NAME$7}: simplifier dependency required — install "meshoptimizer".`);
	return createTransform(NAME$7, async (document) => {
		const logger = document.getLogger();
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("simplify: Missing support for KHR_mesh_primitive_restart.");
		await simplifier.ready;
		await document.transform(weld({ overwrite: false }));
		let numUnsupported = 0;
		for (const mesh of document.getRoot().listMeshes()) {
			for (const prim of mesh.listPrimitives()) {
				const mode = prim.getMode();
				if (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN && mode !== POINTS) {
					numUnsupported++;
					continue;
				}
				simplifyPrimitive(prim, options);
				if (getPrimitiveVertexCount(prim, "render") === 0) deepDisposePrimitive(prim);
			}
			if (mesh.listPrimitives().length === 0) mesh.dispose();
		}
		if (numUnsupported > 0) logger.warn(`${NAME$7}: Skipped ${numUnsupported} primitives: Unsupported draw mode.`);
		logger.debug(`${NAME$7}: Complete.`);
	});
}
/** @hidden */
function simplifyPrimitive(prim, _options) {
	const options = {
		...SIMPLIFY_DEFAULTS,
		..._options
	};
	const simplifier = options.simplifier;
	const graph = prim.getGraph();
	const document = Document.fromGraph(graph);
	const logger = document.getLogger();
	switch (prim.getMode()) {
		case POINTS: return _simplifyPoints(document, prim, options);
		case LINES:
		case LINE_STRIP:
		case LINE_LOOP:
			logger.warn(`${NAME$7}: Skipping primitive simplification: Unsupported draw mode.`);
			return prim;
		case TRIANGLE_STRIP:
		case TRIANGLE_FAN:
			convertPrimitiveToTriangles(prim);
			break;
	}
	const srcVertexCount = getPrimitiveVertexCount(prim, "upload");
	const srcIndexCount = getPrimitiveVertexCount(prim, "render");
	if (srcIndexCount < srcVertexCount / 2) compactPrimitive(prim);
	const position = prim.getAttribute("POSITION");
	const srcIndices = prim.getIndices();
	let positionArray = position.getArray();
	let indicesArray = srcIndices.getArray();
	if (!(positionArray instanceof Float32Array)) positionArray = dequantizeAttributeArray(positionArray, position.getComponentType(), position.getNormalized());
	if (!(indicesArray instanceof Uint32Array)) indicesArray = new Uint32Array(indicesArray);
	const targetCount = Math.floor(options.ratio * srcIndexCount / 3) * 3;
	const [dstIndicesArray, error] = simplifier.simplify(indicesArray, positionArray, 3, targetCount, options.error, options.lockBorder ? ["LockBorder"] : []);
	prim.setIndices(shallowCloneAccessor(document, srcIndices).setArray(dstIndicesArray));
	if (srcIndices.listParents().length === 1) srcIndices.dispose();
	compactPrimitive(prim);
	const dstVertexCount = getPrimitiveVertexCount(prim, "upload");
	if (dstVertexCount <= 65534) prim.getIndices().setArray(new Uint16Array(prim.getIndices().getArray()));
	logger.debug(`${NAME$7}: ${formatDeltaOp(srcVertexCount, dstVertexCount)} vertices, error: ${error.toFixed(4)}.`);
	return prim;
}
function _simplifyPoints(document, prim, options) {
	const simplifier = options.simplifier;
	const logger = document.getLogger();
	if (prim.getIndices()) unweldPrimitive(prim);
	const position = prim.getAttribute("POSITION");
	const color = prim.getAttribute("COLOR_0");
	const srcVertexCount = position.getCount();
	let positionArray = position.getArray();
	let colorArray = color ? color.getArray() : void 0;
	const colorStride = color ? color.getComponentSize() : void 0;
	if (!(positionArray instanceof Float32Array)) positionArray = dequantizeAttributeArray(positionArray, position.getComponentType(), position.getNormalized());
	if (colorArray && !(colorArray instanceof Float32Array)) colorArray = dequantizeAttributeArray(colorArray, position.getComponentType(), position.getNormalized());
	const targetCount = Math.floor(options.ratio * srcVertexCount);
	const dstIndicesArray = simplifier.simplifyPoints(positionArray, 3, targetCount, colorArray, colorStride);
	const [remap, unique] = simplifier.compactMesh(dstIndicesArray);
	logger.debug(`${NAME$7}: ${formatDeltaOp(position.getCount(), unique)} vertices.`);
	for (const srcAttribute of deepListAttributes(prim)) {
		const dstAttribute = shallowCloneAccessor(document, srcAttribute);
		compactAttribute(srcAttribute, null, remap, dstAttribute, unique);
		deepSwapAttribute(prim, srcAttribute, dstAttribute);
		if (srcAttribute.listParents().length === 1) srcAttribute.dispose();
	}
	return prim;
}
//#endregion
//#region src/sparse.ts
const NAME$6 = "sparse";
const SPARSE_DEFAULTS = { ratio: 1 / 3 };
/**
* Scans all {@link Accessor Accessors} in the Document, detecting whether each Accessor
* would benefit from sparse data storage. Currently, sparse data storage is used only
* when many values (>= ratio) are zeroes. Particularly for assets using morph target
* ("shape key") animation, sparse data storage may significantly reduce file sizes.
*
* Example:
*
* ```ts
* import { sparse } from '@gltf-transform/functions';
*
* accessor.getArray(); // → [ 0, 0, 0, 0, 0, 25.0, 0, 0, ... ]
* accessor.getSparse(); // → false
*
* await document.transform(sparse({ratio: 1 / 10}));
*
* accessor.getSparse(); // → true
* ```
*
* @experimental
* @category Transforms
*/
function sparse(_options = SPARSE_DEFAULTS) {
	const ratio = assignDefaults(SPARSE_DEFAULTS, _options).ratio;
	if (ratio < 0 || ratio > 1) throw new Error(`${NAME$6}: Ratio must be between 0 and 1.`);
	return createTransform(NAME$6, (document) => {
		const root = document.getRoot();
		const logger = document.getLogger();
		let modifiedCount = 0;
		for (const accessor of root.listAccessors()) {
			const count = accessor.getCount();
			const base = Array(accessor.getElementSize()).fill(0);
			const el = Array(accessor.getElementSize()).fill(0);
			let nonZeroCount = 0;
			for (let i = 0; i < count; i++) {
				accessor.getElement(i, el);
				if (!MathUtils.eq(el, base, 0)) nonZeroCount++;
				if (nonZeroCount / count >= ratio) break;
			}
			const sparse = nonZeroCount / count < ratio;
			if (sparse !== accessor.getSparse()) {
				accessor.setSparse(sparse);
				modifiedCount++;
			}
		}
		logger.debug(`${NAME$6}: Updated ${modifiedCount} accessors.`);
		logger.debug(`${NAME$6}: Complete.`);
	});
}
//#endregion
//#region src/tangents.ts
const NAME$5 = "tangents";
const TANGENTS_DEFAULTS = { overwrite: false };
/**
* Generates MikkTSpace vertex tangents for mesh primitives, which may fix rendering issues
* occurring with some baked normal maps. Requires access to the [mikktspace](https://github.com/donmccurdy/mikktspace-wasm)
* WASM package, or equivalent.
*
* Example:
*
* ```ts
* import { generateTangents } from 'mikktspace';
* import { tangents } from '@gltf-transform/functions';
*
* await document.transform(
* 	tangents({generateTangents})
* );
* ```
*
* @category Transforms
*/
function tangents(_options = TANGENTS_DEFAULTS) {
	const options = assignDefaults(TANGENTS_DEFAULTS, _options);
	if (!options.generateTangents) throw new Error(`${NAME$5}: generateTangents callback required — install "mikktspace".`);
	return createTransform(NAME$5, (doc) => {
		const logger = doc.getLogger();
		const attributeIDs = /* @__PURE__ */ new Map();
		const tangentCache = /* @__PURE__ */ new Map();
		let modified = 0;
		if (doc.hasExtension("KHR_mesh_primitive_restart")) throw new Error("tangents: Missing support for KHR_mesh_primitive_restart.");
		for (const mesh of doc.getRoot().listMeshes()) {
			const meshName = mesh.getName();
			const meshPrimitives = mesh.listPrimitives();
			for (let i = 0; i < meshPrimitives.length; i++) {
				const prim = meshPrimitives[i];
				if (!filterPrimitive(prim, logger, meshName, i, options.overwrite)) continue;
				const texcoordSemantic = getNormalTexcoord(prim);
				const position = prim.getAttribute("POSITION").getArray();
				const normal = prim.getAttribute("NORMAL").getArray();
				const texcoord = prim.getAttribute(texcoordSemantic).getArray();
				const positionID = attributeIDs.get(position) || uuid();
				attributeIDs.set(position, positionID);
				const normalID = attributeIDs.get(normal) || uuid();
				attributeIDs.set(normal, normalID);
				const texcoordID = attributeIDs.get(texcoord) || uuid();
				attributeIDs.set(texcoord, texcoordID);
				const prevTangent = prim.getAttribute("TANGENT");
				if (prevTangent && prevTangent.listParents().length === 2) prevTangent.dispose();
				const attributeHash = `${positionID}|${normalID}|${texcoordID}`;
				let tangent = tangentCache.get(attributeHash);
				if (tangent) {
					logger.debug(`${NAME$5}: Found cache for primitive ${i} of mesh "${meshName}".`);
					prim.setAttribute("TANGENT", tangent);
					modified++;
					continue;
				}
				logger.debug(`${NAME$5}: Generating for primitive ${i} of mesh "${meshName}".`);
				const tangentBuffer = prim.getAttribute("POSITION").getBuffer();
				const tangentArray = options.generateTangents(position instanceof Float32Array ? position : new Float32Array(position), normal instanceof Float32Array ? normal : new Float32Array(normal), texcoord instanceof Float32Array ? texcoord : new Float32Array(texcoord));
				for (let i = 3; i < tangentArray.length; i += 4) tangentArray[i] *= -1;
				tangent = doc.createAccessor().setBuffer(tangentBuffer).setArray(tangentArray).setType("VEC4");
				prim.setAttribute("TANGENT", tangent);
				tangentCache.set(attributeHash, tangent);
				modified++;
			}
		}
		if (!modified) logger.warn(`${NAME$5}: No qualifying primitives found. See debug output.`);
		else logger.debug(`${NAME$5}: Complete.`);
	});
}
function getNormalTexcoord(prim) {
	const material = prim.getMaterial();
	if (!material) return "TEXCOORD_0";
	const normalTextureInfo = material.getNormalTextureInfo();
	if (!normalTextureInfo) return "TEXCOORD_0";
	const semantic = `TEXCOORD_${normalTextureInfo.getTexCoord()}`;
	if (prim.getAttribute(semantic)) return semantic;
	return "TEXCOORD_0";
}
function filterPrimitive(prim, logger, meshName, i, overwrite) {
	if (prim.getMode() !== Primitive.Mode.TRIANGLES || !prim.getAttribute("POSITION") || !prim.getAttribute("NORMAL") || !prim.getAttribute("TEXCOORD_0")) {
		logger.debug(`${NAME$5}: Skipping primitive ${i} of mesh "${meshName}": primitives must have attributes=[POSITION, NORMAL, TEXCOORD_0] and mode=TRIANGLES.`);
		return false;
	}
	if (prim.getAttribute("TANGENT") && !overwrite) {
		logger.debug(`${NAME$5}: Skipping primitive ${i} of mesh "${meshName}": TANGENT found.`);
		return false;
	}
	if (prim.getIndices()) {
		logger.warn(`${NAME$5}: Skipping primitive ${i} of mesh "${meshName}": primitives must be unwelded.`);
		return false;
	}
	return true;
}
//#endregion
//#region src/texture-compress.ts
const NAME$4 = "textureCompress";
const TEXTURE_COMPRESS_SUPPORTED_FORMATS = [
	"jpeg",
	"png",
	"webp",
	"avif"
];
const SUPPORTED_MIME_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif"
];
/** Resampling filter methods. LANCZOS3 is sharper, LANCZOS2 is smoother. */
let TextureResizeFilter = /* @__PURE__ */ function(TextureResizeFilter) {
	/** Lanczos3 (sharp) */
	TextureResizeFilter["LANCZOS3"] = "lanczos3";
	/** Lanczos2 (smooth) */
	TextureResizeFilter["LANCZOS2"] = "lanczos2";
	return TextureResizeFilter;
}({});
const TEXTURE_COMPRESS_DEFAULTS = {
	resizeFilter: "lanczos3",
	pattern: void 0,
	formats: void 0,
	slots: void 0,
	quality: void 0,
	effort: void 0,
	lossless: false,
	nearLossless: false,
	chromaSubsampling: void 0,
	limitInputPixels: true
};
/**
* Optimizes images, optionally resizing or converting to JPEG, PNG, WebP, or AVIF formats.
*
* For best results use a Node.js environment, install the `sharp` module, and
* provide an encoder. When the encoder is omitted — `sharp` works only in Node.js —
* the implementation will use a platform-specific fallback encoder, and most
* quality- and compression-related options are ignored.
*
* Example:
*
* ```javascript
* import { textureCompress } from '@gltf-transform/functions';
* import sharp from 'sharp';
*
* // (A) Optimize without conversion.
* await document.transform(
* 	textureCompress({encoder: sharp})
* );
*
* // (B) Optimize and convert images to WebP.
* await document.transform(
* 	textureCompress({
* 		encoder: sharp,
* 		targetFormat: 'webp',
* 		slots: /^(?!normalTexture).*$/ // exclude normal maps
* 	})
* );
*
* // (C) Resize and convert images to WebP in a browser, without a Sharp
* // encoder. Most quality- and compression-related options are ignored.
* await document.transform(
* 	textureCompress({ targetFormat: 'webp', resize: [1024, 1024] })
* );
* ```
*
* @category Transforms
*/
function textureCompress(_options) {
	const options = assignDefaults(TEXTURE_COMPRESS_DEFAULTS, _options);
	const targetFormat = options.targetFormat;
	const patternRe = options.pattern;
	const formatsRe = options.formats;
	const slotsRe = options.slots;
	return createTransform(NAME$4, async (document) => {
		const logger = document.getLogger();
		const textures = document.getRoot().listTextures();
		await Promise.all(textures.map(async (texture, textureIndex) => {
			const slots = listTextureSlots(texture);
			const channels = getTextureChannelMask(texture);
			const textureLabel = texture.getURI() || texture.getName() || `${textureIndex + 1}/${document.getRoot().listTextures().length}`;
			const prefix = `${NAME$4}(${textureLabel})`;
			if (!SUPPORTED_MIME_TYPES.includes(texture.getMimeType())) {
				logger.debug(`${prefix}: Skipping, unsupported texture type "${texture.getMimeType()}".`);
				return;
			} else if (patternRe && !patternRe.test(texture.getName()) && !patternRe.test(texture.getURI())) {
				logger.debug(`${prefix}: Skipping, excluded by "pattern" parameter.`);
				return;
			} else if (formatsRe && !formatsRe.test(texture.getMimeType())) {
				logger.debug(`${prefix}: Skipping, "${texture.getMimeType()}" excluded by "formats" parameter.`);
				return;
			} else if (slotsRe && slots.length && !slots.some((slot) => slotsRe.test(slot))) {
				logger.debug(`${prefix}: Skipping, [${slots.join(", ")}] excluded by "slots" parameter.`);
				return;
			} else if (options.targetFormat === "jpeg" && channels & TextureChannel.A) {
				logger.warn(`${prefix}: Skipping, [${slots.join(", ")}] requires alpha channel.`);
				return;
			}
			const srcFormat = getFormat(texture);
			logger.debug(`${prefix}: Format = ${srcFormat} → ${targetFormat || srcFormat}`);
			logger.debug(`${prefix}: Slots = [${slots.join(", ")}]`);
			const srcImage = texture.getImage();
			const srcByteLength = srcImage.byteLength;
			await compressTexture(texture, options);
			const dstImage = texture.getImage();
			const dstByteLength = dstImage.byteLength;
			const flag = srcImage === dstImage ? " (SKIPPED" : "";
			logger.debug(`${prefix}: Size = ${formatBytes(srcByteLength)} → ${formatBytes(dstByteLength)}${flag}`);
		}));
		const webpExtension = document.createExtension(EXTTextureWebP);
		if (textures.some((texture) => texture.getMimeType() === "image/webp")) webpExtension.setRequired(true);
		else webpExtension.dispose();
		const avifExtension = document.createExtension(EXTTextureAVIF);
		if (textures.some((texture) => texture.getMimeType() === "image/avif")) avifExtension.setRequired(true);
		else avifExtension.dispose();
		logger.debug(`${NAME$4}: Complete.`);
	});
}
/**
* Optimizes a single {@link Texture}, optionally resizing or converting to JPEG, PNG, WebP, or AVIF formats.
*
* For best results use a Node.js environment, install the `sharp` module, and
* provide an encoder. When the encoder is omitted — `sharp` works only in Node.js —
* the implementation will use a platform-specific fallback encoder, and most
* quality- and compression-related options are ignored.
*
* Example:
*
* ```javascript
* import { compressTexture } from '@gltf-transform/functions';
* import sharp from 'sharp';
*
* const texture = document.getRoot().listTextures()
* 	.find((texture) => texture.getName() === 'MyTexture');
*
* // (A) Node.js.
* await compressTexture(texture, {
* 	encoder: sharp,
* 	targetFormat: 'webp',
* 	resize: [1024, 1024]
* });
*
* // (B) Web.
* await compressTexture(texture, {
* 	targetFormat: 'webp',
* 	resize: [1024, 1024]
* });
* ```
*/
async function compressTexture(texture, _options) {
	const options = {
		...TEXTURE_COMPRESS_DEFAULTS,
		..._options
	};
	const encoder = options.encoder;
	const srcURI = texture.getURI();
	const srcFormat = getFormat(texture);
	const colorSpace = getTextureColorSpace(texture);
	const dstFormat = options.targetFormat || srcFormat;
	const srcMimeType = texture.getMimeType();
	const dstMimeType = `image/${dstFormat}`;
	const chromaSubsampling = options.chromaSubsampling || (colorSpace === "srgb" ? "4:2:0" : "4:4:4");
	const srcImage = texture.getImage();
	const dstImage = encoder ? await _encodeWithSharp(srcImage, srcMimeType, dstMimeType, {
		...options,
		chromaSubsampling
	}) : await _encodeWithNdarrayPixels(srcImage, srcMimeType, dstMimeType, {
		...options});
	if (srcMimeType === dstMimeType && dstImage.byteLength >= srcImage.byteLength && !options.resize) return;
	else if (srcMimeType === dstMimeType) texture.setImage(dstImage);
	else {
		const srcExtension = srcURI ? FileUtils.extension(srcURI) : ImageUtils.mimeTypeToExtension(srcMimeType);
		const dstExtension = ImageUtils.mimeTypeToExtension(dstMimeType);
		const dstURI = texture.getURI().replace(new RegExp(`\\.${srcExtension}$`), `.${dstExtension}`);
		texture.setImage(dstImage).setMimeType(dstMimeType).setURI(dstURI);
	}
}
async function _encodeWithSharp(srcImage, _srcMimeType, dstMimeType, options) {
	const encoder = options.encoder;
	let encoderOptions = {};
	const dstFormat = getFormatFromMimeType(dstMimeType);
	switch (dstFormat) {
		case "jpeg":
			encoderOptions = {
				quality: options.quality,
				chromaSubsampling: options.chromaSubsampling
			};
			break;
		case "png":
			encoderOptions = {
				quality: options.quality,
				effort: remap(options.effort, 100, 10)
			};
			break;
		case "webp":
			encoderOptions = {
				quality: options.quality,
				effort: remap(options.effort, 100, 6),
				lossless: options.lossless,
				nearLossless: options.nearLossless
			};
			break;
		case "avif":
			encoderOptions = {
				quality: options.quality,
				effort: remap(options.effort, 100, 9),
				lossless: options.lossless,
				chromaSubsampling: options.chromaSubsampling
			};
			break;
	}
	const limitInputPixels = options.limitInputPixels;
	const instance = encoder(srcImage, { limitInputPixels }).toFormat(dstFormat, encoderOptions);
	if (options.resize) {
		const srcSize = ImageUtils.getSize(srcImage, _srcMimeType);
		const dstSize = Array.isArray(options.resize) ? fitWithin(srcSize, options.resize) : fitPowerOfTwo(srcSize, options.resize);
		instance.resize(dstSize[0], dstSize[1], {
			fit: "fill",
			kernel: options.resizeFilter
		});
	}
	return BufferUtils.toView(await instance.toBuffer());
}
async function _encodeWithNdarrayPixels(srcImage, srcMimeType, dstMimeType, options) {
	const srcPixels = await getPixels(srcImage, srcMimeType);
	if (options.resize) {
		const [w, h] = srcPixels.shape;
		const dstSize = Array.isArray(options.resize) ? fitWithin([w, h], options.resize) : fitPowerOfTwo([w, h], options.resize);
		const dstPixels = ndarray(new Uint8Array(dstSize[0] * dstSize[1] * 4), [...dstSize, 4]);
		options.resizeFilter === "lanczos3" ? s(srcPixels, dstPixels) : c(srcPixels, dstPixels);
		return savePixels(dstPixels, dstMimeType);
	}
	return savePixels(srcPixels, dstMimeType);
}
function getFormat(texture) {
	return getFormatFromMimeType(texture.getMimeType());
}
function getFormatFromMimeType(mimeType) {
	const format = mimeType.split("/").pop();
	if (!format || !TEXTURE_COMPRESS_SUPPORTED_FORMATS.includes(format)) throw new Error(`Unknown MIME type "${mimeType}".`);
	return format;
}
function remap(value, srcMax, dstMax) {
	if (value == null) return void 0;
	return Math.round(value / srcMax * dstMax);
}
//#endregion
//#region src/uninstance.ts
const NAME$3 = "uninstance";
const UNINSTANCE_DEFAULTS = {};
/**
* Removes extension {@link EXTMeshGPUInstancing}, reversing the effects of the
* {@link instance} transform or similar instancing operations. For each {@link Node}
* associated with an {@link InstancedMesh}, the Node's {@link Mesh} and InstancedMesh will
* be detached. In their place, one Node per instance will be attached to the original
* Node as children, associated with the same Mesh. The extension, `EXT_mesh_gpu_instancing`,
* will be removed from the {@link Document}.
*
* In applications that support `EXT_mesh_gpu_instancing`, removing the extension
* is likely to substantially increase draw calls and reduce performance. Removing
* the extension may be helpful for compatibility in applications without such support.
*
* Example:
*
* ```ts
* import { uninstance } from '@gltf-transform/functions';
*
* document.getRoot().listNodes(); // → [ Node x 10 ]
*
* await document.transform(uninstance());
*
* document.getRoot().listNodes(); // → [ Node x 1000 ]
* ```
*
* @category Transforms
*/
function uninstance(_options = UNINSTANCE_DEFAULTS) {
	return createTransform(NAME$3, async (document) => {
		const logger = document.getLogger();
		const root = document.getRoot();
		const instanceAttributes = /* @__PURE__ */ new Set();
		for (const srcNode of document.getRoot().listNodes()) {
			const batch = srcNode.getExtension("EXT_mesh_gpu_instancing");
			if (!batch) continue;
			for (const instanceNode of createInstanceNodes(srcNode)) srcNode.addChild(instanceNode);
			for (const instanceAttribute of batch.listAttributes()) instanceAttributes.add(instanceAttribute);
			srcNode.setMesh(null);
			batch.dispose();
		}
		for (const attribute of instanceAttributes) if (attribute.listParents().every((parent) => parent === root)) attribute.dispose();
		document.disposeExtension("EXT_mesh_gpu_instancing");
		logger.debug(`${NAME$3}: Complete.`);
	});
}
/**
* Given a {@link Node} with an {@link InstancedMesh} extension, returns a list
* containing one Node per instance in the InstancedMesh. Each Node will have
* the transform (translation/rotation/scale) of the corresponding instance,
* and will be assigned to the same {@link Mesh}.
*
* May be used to unpack instancing previously applied with {@link instance}
* and {@link EXTMeshGPUInstancing}. For a transform that applies this operation
* to the entire {@link Document}, see {@link uninstance}.
*
* Example:
* ```javascript
* import { createInstanceNodes } from '@gltf-transform/functions';
*
* for (const instanceNode of createInstanceNodes(batchNode)) {
*  batchNode.addChild(instanceNode);
* }
*
* batchNode.setMesh(null).setExtension('EXTMeshGPUInstancing', null);
* ```
*/
function createInstanceNodes(batchNode) {
	const batch = batchNode.getExtension("EXT_mesh_gpu_instancing");
	if (!batch) return [];
	const semantics = batch.listSemantics();
	if (semantics.length === 0) return [];
	const document = Document.fromGraph(batchNode.getGraph());
	const instanceCount = batch.listAttributes()[0].getCount();
	const instanceCountDigits = String(instanceCount).length;
	const mesh = batchNode.getMesh();
	const batchName = batchNode.getName();
	const instanceNodes = [];
	for (let i = 0; i < instanceCount; i++) {
		const instanceNode = document.createNode().setMesh(mesh);
		if (batchName) {
			const paddedIndex = String(i).padStart(instanceCountDigits, "0");
			instanceNode.setName(`${batchName}_${paddedIndex}`);
		}
		for (const semantic of semantics) {
			const attribute = batch.getAttribute(semantic);
			switch (semantic) {
				case "TRANSLATION":
					instanceNode.setTranslation(attribute.getElement(i, [
						0,
						0,
						0
					]));
					break;
				case "ROTATION":
					instanceNode.setRotation(attribute.getElement(i, [
						0,
						0,
						0,
						1
					]));
					break;
				case "SCALE":
					instanceNode.setScale(attribute.getElement(i, [
						1,
						1,
						1
					]));
					break;
				default: _setInstanceExtras(instanceNode, semantic, attribute, i);
			}
		}
		instanceNodes.push(instanceNode);
	}
	return instanceNodes;
}
function _setInstanceExtras(node, semantic, attribute, index) {
	const value = attribute.getType() === "SCALAR" ? attribute.getScalar(index) : attribute.getElement(index, []);
	node.setExtras({
		...node.getExtras(),
		[semantic]: value
	});
}
//#endregion
//#region src/unlit.ts
/**
* @category Transforms
*/
function unlit() {
	return (doc) => {
		const unlit = doc.createExtension(KHRMaterialsUnlit).createUnlit();
		doc.getRoot().listMaterials().forEach((material) => {
			material.setExtension("KHR_materials_unlit", unlit);
		});
	};
}
//#endregion
//#region src/unpartition.ts
const NAME$2 = "unpartition";
const UNPARTITION_DEFAULTS = {};
/**
* Removes partitions from the binary payload of a glTF file, so that the asset
* contains at most one (1) `.bin` {@link Buffer}. This process reverses the
* changes from a {@link partition} transform.
*
* Example:
*
* ```ts
* document.getRoot().listBuffers(); // → [Buffer, Buffer, ...]
*
* await document.transform(unpartition());
*
* document.getRoot().listBuffers(); // → [Buffer]
* ```
*
* @category Transforms
*/
function unpartition(_options = UNPARTITION_DEFAULTS) {
	return createTransform(NAME$2, async (document) => {
		const logger = document.getLogger();
		const buffer = document.getRoot().listBuffers()[0];
		document.getRoot().listAccessors().forEach((a) => a.setBuffer(buffer));
		document.getRoot().listBuffers().forEach((b, index) => index > 0 ? b.dispose() : null);
		logger.debug(`${NAME$2}: Complete.`);
	});
}
//#endregion
//#region src/unwrap.ts
const NAME$1 = "unwrap";
const UNWRAP_DEFAULTS = {
	texcoord: 0,
	overwrite: false,
	groupBy: "mesh"
};
/**
* Generate new texture coordinates (“UV mappings”) for {@link Primitive Primitives}.
* Useful for adding texture coordinates in scenes without existing UVs, or for
* creating a second set of texture coordinates for baked textures such as ambient
* occlusion maps and lightmaps. Operation may increase vertex count to
* accommodate UV seams.
*
* UV layouts may be grouped, reducing the number of textures required. Available
* groupings:
*
* - `"primitive"`: Each primitive is given it's own texcoord atlas.
* - `"mesh"`: All primitives in a mesh share a texcoord atlas. (default)
* - `"scene"`: All primitives in the scene share a texcoord atlas.
*
* Example:
*
* ```ts
* import * as watlas from 'watlas';
* import { unwrap } from '@gltf-transform/functions';
*
* // Generate a TEXCOORD_1 attribute for all primitives.
* await document.transform(
*   unwrap({ watlas, texcoord: 1, overwrite: true, groupBy: 'scene' })
* );
* ```
*
* For more control and customization, see {@link unwrapPrimitives}.
*
* @experimental
* @category Transforms
*/
function unwrap(_options) {
	const options = {
		...UNWRAP_DEFAULTS,
		..._options
	};
	const watlas = options.watlas;
	if (!watlas) throw new Error(`${NAME$1}: dependency required — install "watlas".`);
	return createTransform(NAME$1, async (document) => {
		if (document.hasExtension("KHR_mesh_primitive_restart")) throw new Error("unwrap: Missing support for KHR_mesh_primitive_restart.");
		await watlas.Initialize();
		switch (options.groupBy) {
			case "primitive":
				for (const mesh of document.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) unwrapPrimitives([prim], options);
				break;
			case "mesh":
				for (const mesh of document.getRoot().listMeshes()) unwrapPrimitives(mesh.listPrimitives(), options);
				break;
			case "scene": {
				const prims = [];
				const weights = [];
				for (const mesh of document.getRoot().listMeshes()) {
					const weight = getNodeScaleMax(mesh);
					for (const prim of mesh.listPrimitives()) {
						prims.push(prim);
						weights.push(weight);
					}
				}
				unwrapPrimitives(prims, {
					...options,
					weights
				});
				break;
			}
		}
		document.getLogger().debug(`${NAME$1}: Complete.`);
	});
}
/**
* Generate new texture coordinates (“UV mappings”) for {@link Primitive Primitives}.
* Useful for adding texture coordinates in scenes without existing UVs, or for
* creating a second set of texture coordinates for baked textures such as ambient
* occlusion maps and lightmaps. Operation may increase vertex count to
* accommodate UV seams.
*
* UV layouts may be grouped, reducing the number of textures required. Available
* groupings:
*
* - `"primitive"`: Each primitive is given it's own texcoord atlas.
* - `"mesh"`: All primitives in a mesh share a texcoord atlas. (default)
* - `"scene"`: All primitives in the scene share a texcoord atlas.
*
* watlas must be initialized before calling this function.
*
* Example:
*
* ```ts
* import * as watlas from 'watlas';
* import { unwrapPrimitives } from '@gltf-transform/functions';
*
* // Initialize watlas.
* await watlas.Initialize();
*
* // Generate a TEXCOORD_1 attribute for the specified primitives.
* unwrapPrimitives(mesh.listPrimitives(), {
*   watlas,
*   texcoord: 1,
*   overwrite: true
* });
* ```
*
* To create texture coordinates for an entire Document, see {@link unwrap}.
*
* @experimental
*/
function unwrapPrimitives(primitives, options) {
	const document = Document.fromGraph(primitives[0].getGraph());
	const watlas = options.watlas;
	const dstTexCoordIndex = options.texcoord ?? 0;
	const dstSemantic = `TEXCOORD_${dstTexCoordIndex}`;
	if (!watlas) throw new Error(`${NAME$1}: dependency required — install "watlas".`);
	const atlas = new watlas.Atlas();
	const unwrapPrims = [];
	for (let i = 0; i < primitives.length; i++) {
		const prim = primitives[i];
		const primWeight = options.weights ? options.weights[i] : 1;
		if (!options.overwrite && prim.getAttribute(dstSemantic)) continue;
		const unwrapPrim = compactPrimitive(prim);
		const position = unwrapPrim.getAttribute("POSITION");
		const meshDecl = {
			vertexCount: position.getCount(),
			vertexPositionData: getScaledAttributeFloat32Array(position, primWeight),
			vertexPositionStride: position.getElementSize() * Float32Array.BYTES_PER_ELEMENT
		};
		const normal = unwrapPrim.getAttribute("NORMAL");
		if (normal) {
			meshDecl.vertexNormalData = getAttributeFloat32Array(normal);
			meshDecl.vertexNormalStride = normal.getElementSize() * Float32Array.BYTES_PER_ELEMENT;
		}
		if (options.texcoord !== 0) {
			const texcoord = unwrapPrim.getAttribute("TEXCOORD_0");
			if (texcoord) {
				meshDecl.vertexUvData = getAttributeFloat32Array(texcoord);
				meshDecl.vertexUvStride = texcoord.getElementSize() * Float32Array.BYTES_PER_ELEMENT;
			}
		}
		const indices = unwrapPrim.getIndices();
		if (indices) {
			const indicesArray = indices.getArray();
			meshDecl.indexCount = indices.getCount();
			meshDecl.indexData = indicesArray instanceof Uint8Array ? new Uint16Array(indicesArray) : indicesArray;
		}
		unwrapPrims.push(unwrapPrim);
		atlas.addMesh(meshDecl);
	}
	if (unwrapPrims.length === 0) return;
	atlas.generate();
	if (atlas.meshCount !== unwrapPrims.length) throw new Error(`${NAME$1}: Generated an unexpected number of atlas meshes. (got: ${atlas.meshCount}, expected: ${unwrapPrims.length})`);
	const scale = [1 / atlas.width, 1 / atlas.height];
	for (let i = 0; i < atlas.meshCount; i++) {
		const prim = unwrapPrims[i];
		const atlasMesh = atlas.getMesh(i);
		const srcTexCoord = prim.getAttribute(dstSemantic);
		if (srcTexCoord) {
			prim.setAttribute(dstSemantic, null);
			if (!isUsed(srcTexCoord)) srcTexCoord.dispose();
		}
		for (const srcAttribute of prim.listAttributes()) {
			prim.swap(srcAttribute, remapAttribute(document, srcAttribute, atlasMesh));
			if (!isUsed(srcAttribute)) srcAttribute.dispose();
		}
		for (const target of prim.listTargets()) for (const srcAttribute of target.listAttributes()) {
			target.swap(srcAttribute, remapAttribute(document, srcAttribute, atlasMesh));
			if (!isUsed(srcAttribute)) srcAttribute.dispose();
		}
		const dstTexCoord = document.createAccessor().setArray(new Float32Array(atlasMesh.vertexCount * 2)).setType("VEC2");
		for (let j = 0; j < atlasMesh.vertexCount; j++) {
			const vertex = atlasMesh.getVertex(j);
			dstTexCoord.setElement(j, [vertex.uv[0] * scale[0], vertex.uv[1] * scale[1]]);
		}
		prim.setAttribute(dstSemantic, dstTexCoord);
		for (let j = dstTexCoordIndex - 1; j >= 0; j--) {
			const semantic = `TEXCOORD_${j}`;
			if (!prim.getAttribute(semantic)) prim.setAttribute(semantic, dstTexCoord);
		}
		const dstIndicesArray = new Uint32Array(atlasMesh.indexCount);
		atlasMesh.getIndexArray(dstIndicesArray);
		const dstIndices = document.createAccessor().setArray(dstIndicesArray).setType("SCALAR");
		const srcIndices = prim.getIndices();
		prim.setIndices(dstIndices);
		if (srcIndices && !isUsed(srcIndices)) srcIndices.dispose();
	}
	atlas.delete();
}
function remapAttribute(document, srcAttribute, atlasMesh) {
	const dstAttribute = shallowCloneAccessor(document, srcAttribute);
	const ArrayCtor = srcAttribute.getArray().constructor;
	dstAttribute.setArray(new ArrayCtor(atlasMesh.vertexCount * srcAttribute.getElementSize()));
	const el = [];
	for (let i = 0; i < atlasMesh.vertexCount; i++) {
		const vertex = atlasMesh.getVertex(i);
		dstAttribute.setElement(i, srcAttribute.getElement(vertex.xref, el));
	}
	return dstAttribute;
}
function getAttributeFloat32Array(attribute) {
	if (attribute.getComponentType() === Accessor.ComponentType.FLOAT) return attribute.getArray();
	return dequantizeAttributeArray(attribute.getArray(), attribute.getComponentType(), attribute.getNormalized());
}
function getScaledAttributeFloat32Array(attribute, scale) {
	const array = dequantizeAttributeArray(attribute.getArray(), attribute.getComponentType(), attribute.getNormalized());
	for (let i = 0; i < array.length; i++) array[i] *= scale;
	return array;
}
function getNodeScaleMax(mesh) {
	let scale = -Infinity;
	for (const parent of mesh.listParents()) if (parent instanceof Node) {
		const s = parent.getWorldScale();
		scale = Number.isFinite(s[0]) ? Math.max(scale, Math.abs(s[0])) : scale;
		scale = Number.isFinite(s[1]) ? Math.max(scale, Math.abs(s[1])) : scale;
		scale = Number.isFinite(s[2]) ? Math.max(scale, Math.abs(s[2])) : scale;
	}
	return scale > 0 && Number.isFinite(scale) ? scale : 1;
}
//#endregion
//#region src/vertex-color-space.ts
const NAME = "vertexColorSpace";
/**
* Vertex color color space correction. The glTF format requires vertex colors to be stored
* in Linear Rec. 709 D65 color space, and this function provides a way to correct vertex
* colors that are (incorrectly) stored in sRGB.
*
* Example:
*
* ```typescript
* import { vertexColorSpace } from '@gltf-transform/functions';
*
* await document.transform(
*   vertexColorSpace({ inputColorSpace: 'srgb' })
* );
* ```
*
* @category Transforms
*/
function vertexColorSpace(options) {
	return createTransform(NAME, (doc) => {
		const logger = doc.getLogger();
		const inputColorSpace = (options.inputColorSpace || "").toLowerCase();
		if (inputColorSpace === "srgb-linear") {
			logger.info(`${NAME}: Vertex colors already linear. Skipping conversion.`);
			return;
		}
		if (inputColorSpace !== "srgb") {
			logger.error(`${NAME}: Unknown input color space "${inputColorSpace}" – should be "srgb" or "srgb-linear". Skipping conversion.`);
			return;
		}
		const converted = /* @__PURE__ */ new Set();
		function sRGBToLinear(c) {
			return c < .04045 ? c * .0773993808 : Math.pow(c * .9478672986 + .0521327014, 2.4);
		}
		function updatePrimitive(primitive) {
			const color = [
				0,
				0,
				0
			];
			let attribute;
			for (let i = 0; attribute = primitive.getAttribute(`COLOR_${i}`); i++) {
				if (converted.has(attribute)) continue;
				for (let j = 0; j < attribute.getCount(); j++) {
					attribute.getElement(j, color);
					color[0] = sRGBToLinear(color[0]);
					color[1] = sRGBToLinear(color[1]);
					color[2] = sRGBToLinear(color[2]);
					attribute.setElement(j, color);
				}
				converted.add(attribute);
			}
		}
		doc.getRoot().listMeshes().forEach((mesh) => mesh.listPrimitives().forEach(updatePrimitive));
		logger.debug(`${NAME}: Complete.`);
	});
}

export { DRACO_DEFAULTS, FLATTEN_DEFAULTS, INSTANCE_DEFAULTS, JOIN_DEFAULTS, MESHOPT_DEFAULTS, PALETTE_DEFAULTS, PRUNE_DEFAULTS, QUANTIZE_DEFAULTS, SIMPLIFY_DEFAULTS, TEXTURE_COMPRESS_DEFAULTS, TEXTURE_COMPRESS_SUPPORTED_FORMATS, TextureResizeFilter, UNWRAP_DEFAULTS, VertexCountMethod, WELD_DEFAULTS, assignDefaults, center, clearNodeParent, clearNodeTransform, cloneDocument, compactAttribute, compactPrimitive, compressTexture, convertPrimitiveToLines, convertPrimitiveToTriangles, copyToDocument, createDefaultPropertyResolver, createInstanceNodes, createTransform, dedup, dequantize, dequantizePrimitive, draco, fitPowerOfTwo, fitWithin, flatten, getBounds, getGLPrimitiveCount, getMeshVertexCount, getNodeVertexCount, getPrimitiveVertexCount, getSceneVertexCount, getTextureChannelMask, getTextureColorSpace, inspect, instance, isTransformPending, join, joinPrimitives, listNodeScenes, listTextureChannels, listTextureInfo, listTextureInfoByMaterial, listTextureSlots, mergeDocuments, meshopt, metalRough, moveToDocument, normals, palette, partition, prune, quantize, reorder, resample, sequence, simplify, simplifyPrimitive, sortPrimitiveWeights, sparse, tangents, textureCompress, transformMesh, transformPrimitive, uninstance, unlit, unpartition, unweld, unweldPrimitive, unwrap, unwrapPrimitives, vertexColorSpace, weld, weldPrimitive };
