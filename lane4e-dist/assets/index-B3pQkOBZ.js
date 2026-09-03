import { cC as unzipSync, cD as strFromU8, cE as strToU8, cF as zipSync } from './index-CtIMEkHY.js';
import { S as SpanStatusCode, t as trace } from './trace-api-BIfvUk_c.js';
import './preload-helper-CJHylW7d.js';
import './ElementStore-CQe7ZDFd.js';
import './LODManager-DHqndFcX.js';
import './SteelProfileLibrary-NgbfwhrM.js';
import './three.core-Bv4ks8y-.js';
import './three.module-zvZFyv9V.js';

const nameStartChar = ':A-Za-z_\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD';
const nameChar = nameStartChar + '\\-.\\d\\u00B7\\u0300-\\u036F\\u203F-\\u2040';
const nameRegexp = '[' + nameStartChar + '][' + nameChar + ']*';
const regexName = new RegExp('^' + nameRegexp + '$');

function getAllMatches(string, regex) {
  const matches = [];
  let match = regex.exec(string);
  while (match) {
    const allmatches = [];
    allmatches.startIndex = regex.lastIndex - match[0].length;
    const len = match.length;
    for (let index = 0; index < len; index++) {
      allmatches.push(match[index]);
    }
    matches.push(allmatches);
    match = regex.exec(string);
  }
  return matches;
}

const isName = function (string) {
  const match = regexName.exec(string);
  return !(match === null || typeof match === 'undefined');
};

function isExist(v) {
  return typeof v !== 'undefined';
}

/**
 * Dangerous property names that could lead to prototype pollution or security issues
 */
const DANGEROUS_PROPERTY_NAMES = [
  // '__proto__',
  // 'constructor',
  // 'prototype',
  'hasOwnProperty',
  'toString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
];

const criticalProperties = ["__proto__", "constructor", "prototype"];

const defaultOptions$1 = {
  allowBooleanAttributes: false, //A tag can have attributes without any value
  unpairedTags: []
};

//const tagsPattern = new RegExp("<\\/?([\\w:\\-_\.]+)\\s*\/?>","g");
function validate(xmlData, options) {
  options = Object.assign({}, defaultOptions$1, options);

  //xmlData = xmlData.replace(/(\r\n|\n|\r)/gm,"");//make it single line
  //xmlData = xmlData.replace(/(^\s*<\?xml.*?\?>)/g,"");//Remove XML starting tag
  //xmlData = xmlData.replace(/(<!DOCTYPE[\s\w\"\.\/\-\:]+(\[.*\])*\s*>)/g,"");//Remove DOCTYPE
  const tags = [];
  let tagFound = false;

  //indicates that the root tag has been closed (aka. depth 0 has been reached)
  let reachedRoot = false;

  if (xmlData[0] === '\ufeff') {
    // check for byte order mark (BOM)
    xmlData = xmlData.substr(1);
  }

  for (let i = 0; i < xmlData.length; i++) {

    if (xmlData[i] === '<' && xmlData[i + 1] === '?') {
      i += 2;
      i = readPI(xmlData, i);
      if (i.err) return i;
    } else if (xmlData[i] === '<') {
      //starting of tag
      //read until you reach to '>' avoiding any '>' in attribute value
      let tagStartPos = i;
      i++;

      if (xmlData[i] === '!') {
        i = readCommentAndCDATA(xmlData, i);
        continue;
      } else {
        let closingTag = false;
        if (xmlData[i] === '/') {
          //closing tag
          closingTag = true;
          i++;
        }
        //read tagname
        let tagName = '';
        for (; i < xmlData.length &&
          xmlData[i] !== '>' &&
          xmlData[i] !== ' ' &&
          xmlData[i] !== '\t' &&
          xmlData[i] !== '\n' &&
          xmlData[i] !== '\r'; i++
        ) {
          tagName += xmlData[i];
        }
        tagName = tagName.trim();
        //console.log(tagName);

        if (tagName[tagName.length - 1] === '/') {
          //self closing tag without attributes
          tagName = tagName.substring(0, tagName.length - 1);
          //continue;
          i--;
        }
        if (!validateTagName(tagName)) {
          let msg;
          if (tagName.trim().length === 0) {
            msg = "Invalid space after '<'.";
          } else {
            msg = "Tag '" + tagName + "' is an invalid name.";
          }
          return getErrorObject('InvalidTag', msg, getLineNumberForPosition(xmlData, i));
        }

        const result = readAttributeStr(xmlData, i);
        if (result === false) {
          return getErrorObject('InvalidAttr', "Attributes for '" + tagName + "' have open quote.", getLineNumberForPosition(xmlData, i));
        }
        let attrStr = result.value;
        i = result.index;

        if (attrStr[attrStr.length - 1] === '/') {
          //self closing tag
          const attrStrStart = i - attrStr.length;
          attrStr = attrStr.substring(0, attrStr.length - 1);
          const isValid = validateAttributeString(attrStr, options);
          if (isValid === true) {
            tagFound = true;
            //continue; //text may presents after self closing tag
          } else {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, attrStrStart + isValid.err.line));
          }
        } else if (closingTag) {
          if (!result.tagClosed) {
            return getErrorObject('InvalidTag', "Closing tag '" + tagName + "' doesn't have proper closing.", getLineNumberForPosition(xmlData, i));
          } else if (attrStr.trim().length > 0) {
            return getErrorObject('InvalidTag', "Closing tag '" + tagName + "' can't have attributes or invalid starting.", getLineNumberForPosition(xmlData, tagStartPos));
          } else if (tags.length === 0) {
            return getErrorObject('InvalidTag', "Closing tag '" + tagName + "' has not been opened.", getLineNumberForPosition(xmlData, tagStartPos));
          } else {
            const otg = tags.pop();
            if (tagName !== otg.tagName) {
              let openPos = getLineNumberForPosition(xmlData, otg.tagStartPos);
              return getErrorObject('InvalidTag',
                "Expected closing tag '" + otg.tagName + "' (opened in line " + openPos.line + ", col " + openPos.col + ") instead of closing tag '" + tagName + "'.",
                getLineNumberForPosition(xmlData, tagStartPos));
            }

            //when there are no more tags, we reached the root level.
            if (tags.length == 0) {
              reachedRoot = true;
            }
          }
        } else {
          const isValid = validateAttributeString(attrStr, options);
          if (isValid !== true) {
            //the result from the nested function returns the position of the error within the attribute
            //in order to get the 'true' error line, we need to calculate the position where the attribute begins (i - attrStr.length) and then add the position within the attribute
            //this gives us the absolute index in the entire xml, which we can use to find the line at last
            return getErrorObject(isValid.err.code, isValid.err.msg, getLineNumberForPosition(xmlData, i - attrStr.length + isValid.err.line));
          }

          //if the root level has been reached before ...
          if (reachedRoot === true) {
            return getErrorObject('InvalidXml', 'Multiple possible root nodes found.', getLineNumberForPosition(xmlData, i));
          } else if (options.unpairedTags.indexOf(tagName) !== -1) ; else {
            tags.push({ tagName, tagStartPos });
          }
          tagFound = true;
        }

        //skip tag text value
        //It may include comments and CDATA value
        for (i++; i < xmlData.length; i++) {
          if (xmlData[i] === '<') {
            if (xmlData[i + 1] === '!') {
              //comment or CADATA
              i++;
              i = readCommentAndCDATA(xmlData, i);
              continue;
            } else if (xmlData[i + 1] === '?') {
              i = readPI(xmlData, ++i);
              if (i.err) return i;
            } else {
              break;
            }
          } else if (xmlData[i] === '&') {
            const afterAmp = validateAmpersand(xmlData, i);
            if (afterAmp == -1)
              return getErrorObject('InvalidChar', "char '&' is not expected.", getLineNumberForPosition(xmlData, i));
            i = afterAmp;
          } else {
            if (reachedRoot === true && !isWhiteSpace(xmlData[i])) {
              return getErrorObject('InvalidXml', "Extra text at the end", getLineNumberForPosition(xmlData, i));
            }
          }
        } //end of reading tag text value
        if (xmlData[i] === '<') {
          i--;
        }
      }
    } else {
      if (isWhiteSpace(xmlData[i])) {
        continue;
      }
      return getErrorObject('InvalidChar', "char '" + xmlData[i] + "' is not expected.", getLineNumberForPosition(xmlData, i));
    }
  }

  if (!tagFound) {
    return getErrorObject('InvalidXml', 'Start tag expected.', 1);
  } else if (tags.length == 1) {
    return getErrorObject('InvalidTag', "Unclosed tag '" + tags[0].tagName + "'.", getLineNumberForPosition(xmlData, tags[0].tagStartPos));
  } else if (tags.length > 0) {
    return getErrorObject('InvalidXml', "Invalid '" +
      JSON.stringify(tags.map(t => t.tagName), null, 4).replace(/\r?\n/g, '') +
      "' found.", { line: 1, col: 1 });
  }

  return true;
}
function isWhiteSpace(char) {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r';
}
/**
 * Read Processing insstructions and skip
 * @param {*} xmlData
 * @param {*} i
 */
function readPI(xmlData, i) {
  const start = i;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] == '?' || xmlData[i] == ' ') {
      //tagname
      const tagname = xmlData.substr(start, i - start);
      if (i > 5 && tagname === 'xml') {
        return getErrorObject('InvalidXml', 'XML declaration allowed only at the start of the document.', getLineNumberForPosition(xmlData, i));
      } else if (xmlData[i] == '?' && xmlData[i + 1] == '>') {
        //check if valid attribut string
        i++;
        break;
      } else {
        continue;
      }
    }
  }
  return i;
}

function readCommentAndCDATA(xmlData, i) {
  if (xmlData.length > i + 5 && xmlData[i + 1] === '-' && xmlData[i + 2] === '-') {
    //comment
    for (i += 3; i < xmlData.length; i++) {
      if (xmlData[i] === '-' && xmlData[i + 1] === '-' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  } else if (
    xmlData.length > i + 8 &&
    xmlData[i + 1] === 'D' &&
    xmlData[i + 2] === 'O' &&
    xmlData[i + 3] === 'C' &&
    xmlData[i + 4] === 'T' &&
    xmlData[i + 5] === 'Y' &&
    xmlData[i + 6] === 'P' &&
    xmlData[i + 7] === 'E'
  ) {
    let angleBracketsCount = 1;
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === '<') {
        angleBracketsCount++;
      } else if (xmlData[i] === '>') {
        angleBracketsCount--;
        if (angleBracketsCount === 0) {
          break;
        }
      }
    }
  } else if (
    xmlData.length > i + 9 &&
    xmlData[i + 1] === '[' &&
    xmlData[i + 2] === 'C' &&
    xmlData[i + 3] === 'D' &&
    xmlData[i + 4] === 'A' &&
    xmlData[i + 5] === 'T' &&
    xmlData[i + 6] === 'A' &&
    xmlData[i + 7] === '['
  ) {
    for (i += 8; i < xmlData.length; i++) {
      if (xmlData[i] === ']' && xmlData[i + 1] === ']' && xmlData[i + 2] === '>') {
        i += 2;
        break;
      }
    }
  }

  return i;
}

const doubleQuote = '"';
const singleQuote = "'";

/**
 * Keep reading xmlData until '<' is found outside the attribute value.
 * @param {string} xmlData
 * @param {number} i
 */
function readAttributeStr(xmlData, i) {
  let attrStr = '';
  let startChar = '';
  let tagClosed = false;
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === doubleQuote || xmlData[i] === singleQuote) {
      if (startChar === '') {
        startChar = xmlData[i];
      } else if (startChar !== xmlData[i]) ; else {
        startChar = '';
      }
    } else if (xmlData[i] === '>') {
      if (startChar === '') {
        tagClosed = true;
        break;
      }
    }
    attrStr += xmlData[i];
  }
  if (startChar !== '') {
    return false;
  }

  return {
    value: attrStr,
    index: i,
    tagClosed: tagClosed
  };
}

/**
 * Select all the attributes whether valid or invalid.
 */
const validAttrStrRegxp = new RegExp('(\\s*)([^\\s=]+)(\\s*=)?(\\s*([\'"])(([\\s\\S])*?)\\5)?', 'g');

//attr, ="sd", a="amit's", a="sd"b="saf", ab  cd=""

function validateAttributeString(attrStr, options) {
  //console.log("start:"+attrStr+":end");

  //if(attrStr.trim().length === 0) return true; //empty string

  const matches = getAllMatches(attrStr, validAttrStrRegxp);
  const attrNames = {};

  for (let i = 0; i < matches.length; i++) {
    if (matches[i][1].length === 0) {
      //nospace before attribute name: a="sd"b="saf"
      return getErrorObject('InvalidAttr', "Attribute '" + matches[i][2] + "' has no space in starting.", getPositionFromMatch(matches[i]))
    } else if (matches[i][3] !== undefined && matches[i][4] === undefined) {
      return getErrorObject('InvalidAttr', "Attribute '" + matches[i][2] + "' is without value.", getPositionFromMatch(matches[i]));
    } else if (matches[i][3] === undefined && !options.allowBooleanAttributes) {
      //independent attribute: ab
      return getErrorObject('InvalidAttr', "boolean attribute '" + matches[i][2] + "' is not allowed.", getPositionFromMatch(matches[i]));
    }
    /* else if(matches[i][6] === undefined){//attribute without value: ab=
                    return { err: { code:"InvalidAttr",msg:"attribute " + matches[i][2] + " has no value assigned."}};
                } */
    const attrName = matches[i][2];
    if (!validateAttrName(attrName)) {
      return getErrorObject('InvalidAttr', "Attribute '" + attrName + "' is an invalid name.", getPositionFromMatch(matches[i]));
    }
    if (!Object.prototype.hasOwnProperty.call(attrNames, attrName)) {
      //check for duplicate attribute.
      attrNames[attrName] = 1;
    } else {
      return getErrorObject('InvalidAttr', "Attribute '" + attrName + "' is repeated.", getPositionFromMatch(matches[i]));
    }
  }

  return true;
}

function validateNumberAmpersand(xmlData, i) {
  let re = /\d/;
  if (xmlData[i] === 'x') {
    i++;
    re = /[\da-fA-F]/;
  }
  for (; i < xmlData.length; i++) {
    if (xmlData[i] === ';')
      return i;
    if (!xmlData[i].match(re))
      break;
  }
  return -1;
}

function validateAmpersand(xmlData, i) {
  // https://www.w3.org/TR/xml/#dt-charref
  i++;
  if (xmlData[i] === ';')
    return -1;
  if (xmlData[i] === '#') {
    i++;
    return validateNumberAmpersand(xmlData, i);
  }
  let count = 0;
  for (; i < xmlData.length; i++, count++) {
    if (xmlData[i].match(/\w/) && count < 20)
      continue;
    if (xmlData[i] === ';')
      break;
    return -1;
  }
  return i;
}

function getErrorObject(code, message, lineNumber) {
  return {
    err: {
      code: code,
      msg: message,
      line: lineNumber.line || lineNumber,
      col: lineNumber.col,
    },
  };
}

function validateAttrName(attrName) {
  return isName(attrName);
}

// const startsWithXML = /^xml/i;

function validateTagName(tagname) {
  return isName(tagname) /* && !tagname.match(startsWithXML) */;
}

//this function returns the line number for the character at the given index
function getLineNumberForPosition(xmlData, index) {
  const lines = xmlData.substring(0, index).split(/\r?\n/);
  return {
    line: lines.length,

    // column number is last line's length + 1, because column numbering starts at 1:
    col: lines[lines.length - 1].length + 1
  };
}

//this function returns the position of the first character of match within attrStr
function getPositionFromMatch(match) {
  return match.startIndex + match[1].length;
}

const defaultOnDangerousProperty = (name) => {
  if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return "__" + name;
  }
  return name;
};


const defaultOptions = {
  preserveOrder: false,
  attributeNamePrefix: '@_',
  attributesGroupName: false,
  textNodeName: '#text',
  ignoreAttributes: true,
  removeNSPrefix: false, // remove NS from tag name or attribute name if true
  allowBooleanAttributes: false, //a tag can have attributes without any value
  //ignoreRootElement : false,
  parseTagValue: true,
  parseAttributeValue: false,
  trimValues: true, //Trim string values of tag and attributes
  cdataPropName: false,
  numberParseOptions: {
    hex: true,
    leadingZeros: true,
    eNotation: true
  },
  tagValueProcessor: function (tagName, val) {
    return val;
  },
  attributeValueProcessor: function (attrName, val) {
    return val;
  },
  stopNodes: [], //nested tags will not be parsed even for errors
  alwaysCreateTextNode: false,
  isArray: () => false,
  commentPropName: false,
  unpairedTags: [],
  processEntities: true,
  htmlEntities: false,
  ignoreDeclaration: false,
  ignorePiTags: false,
  transformTagName: false,
  transformAttributeName: false,
  updateTag: function (tagName, jPath, attrs) {
    return tagName
  },
  // skipEmptyListItem: false
  captureMetaData: false,
  maxNestedTags: 100,
  strictReservedNames: true,
  jPath: true, // if true, pass jPath string to callbacks; if false, pass matcher instance
  onDangerousProperty: defaultOnDangerousProperty
};


/**
 * Validates that a property name is safe to use
 * @param {string} propertyName - The property name to validate
 * @param {string} optionName - The option field name (for error message)
 * @throws {Error} If property name is dangerous
 */
function validatePropertyName(propertyName, optionName) {
  if (typeof propertyName !== 'string') {
    return; // Only validate string property names
  }

  const normalized = propertyName.toLowerCase();
  if (DANGEROUS_PROPERTY_NAMES.some(dangerous => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }

  if (criticalProperties.some(dangerous => normalized === dangerous.toLowerCase())) {
    throw new Error(
      `[SECURITY] Invalid ${optionName}: "${propertyName}" is a reserved JavaScript keyword that could cause prototype pollution`
    );
  }
}

/**
 * Normalizes processEntities option for backward compatibility
 * @param {boolean|object} value 
 * @returns {object} Always returns normalized object
 */
function normalizeProcessEntities(value) {
  // Boolean backward compatibility
  if (typeof value === 'boolean') {
    return {
      enabled: value, // true or false
      maxEntitySize: 10000,
      maxExpansionDepth: 10,
      maxTotalExpansions: 1000,
      maxExpandedLength: 100000,
      maxEntityCount: 100,
      allowedTags: null,
      tagFilter: null
    };
  }

  // Object config - merge with defaults
  if (typeof value === 'object' && value !== null) {
    return {
      enabled: value.enabled !== false, // default true if not specified
      maxEntitySize: value.maxEntitySize ?? 10000,
      maxExpansionDepth: value.maxExpansionDepth ?? 10,
      maxTotalExpansions: value.maxTotalExpansions ?? 1000,
      maxExpandedLength: value.maxExpandedLength ?? 100000,
      maxEntityCount: value.maxEntityCount ?? 100,
      allowedTags: value.allowedTags ?? null,
      tagFilter: value.tagFilter ?? null
    };
  }

  // Default to enabled with limits
  return normalizeProcessEntities(true);
}

const buildOptions = function (options) {
  const built = Object.assign({}, defaultOptions, options);

  // Validate property names to prevent prototype pollution
  const propertyNameOptions = [
    { value: built.attributeNamePrefix, name: 'attributeNamePrefix' },
    { value: built.attributesGroupName, name: 'attributesGroupName' },
    { value: built.textNodeName, name: 'textNodeName' },
    { value: built.cdataPropName, name: 'cdataPropName' },
    { value: built.commentPropName, name: 'commentPropName' }
  ];

  for (const { value, name } of propertyNameOptions) {
    if (value) {
      validatePropertyName(value, name);
    }
  }

  if (built.onDangerousProperty === null) {
    built.onDangerousProperty = defaultOnDangerousProperty;
  }

  // Always normalize processEntities for backward compatibility and validation
  built.processEntities = normalizeProcessEntities(built.processEntities);

  // Convert old-style stopNodes for backward compatibility
  if (built.stopNodes && Array.isArray(built.stopNodes)) {
    built.stopNodes = built.stopNodes.map(node => {
      if (typeof node === 'string' && node.startsWith('*.')) {
        // Old syntax: *.tagname meant "tagname anywhere"
        // Convert to new syntax: ..tagname
        return '..' + node.substring(2);
      }
      return node;
    });
  }
  //console.debug(built.processEntities)
  return built;
};

let METADATA_SYMBOL$1;

if (typeof Symbol !== "function") {
  METADATA_SYMBOL$1 = "@@xmlMetadata";
} else {
  METADATA_SYMBOL$1 = Symbol("XML Node Metadata");
}

class XmlNode {
  constructor(tagname) {
    this.tagname = tagname;
    this.child = []; //nested tags, text, cdata, comments in order
    this[":@"] = Object.create(null); //attributes map
  }
  add(key, val) {
    // this.child.push( {name : key, val: val, isCdata: isCdata });
    if (key === "__proto__") key = "#__proto__";
    this.child.push({ [key]: val });
  }
  addChild(node, startIndex) {
    if (node.tagname === "__proto__") node.tagname = "#__proto__";
    if (node[":@"] && Object.keys(node[":@"]).length > 0) {
      this.child.push({ [node.tagname]: node.child, [":@"]: node[":@"] });
    } else {
      this.child.push({ [node.tagname]: node.child });
    }
    // if requested, add the startIndex
    if (startIndex !== undefined) {
      // Note: for now we just overwrite the metadata. If we had more complex metadata,
      // we might need to do an object append here:  metadata = { ...metadata, startIndex }
      this.child[this.child.length - 1][METADATA_SYMBOL$1] = { startIndex };
    }
  }
  /** symbol used for metadata */
  static getMetaDataSymbol() {
    return METADATA_SYMBOL$1;
  }
}

class DocTypeReader {
    constructor(options) {
        this.suppressValidationErr = !options;
        this.options = options;
    }

    readDocType(xmlData, i) {
        const entities = Object.create(null);
        let entityCount = 0;

        if (xmlData[i + 3] === 'O' &&
            xmlData[i + 4] === 'C' &&
            xmlData[i + 5] === 'T' &&
            xmlData[i + 6] === 'Y' &&
            xmlData[i + 7] === 'P' &&
            xmlData[i + 8] === 'E') {
            i = i + 9;
            let angleBracketsCount = 1;
            let hasBody = false, comment = false;
            let exp = "";
            for (; i < xmlData.length; i++) {
                if (xmlData[i] === '<' && !comment) { //Determine the tag type
                    if (hasBody && hasSeq(xmlData, "!ENTITY", i)) {
                        i += 7;
                        let entityName, val;
                        [entityName, val, i] = this.readEntityExp(xmlData, i + 1, this.suppressValidationErr);
                        if (val.indexOf("&") === -1) { //Parameter entities are not supported
                            if (this.options.enabled !== false &&
                                this.options.maxEntityCount &&
                                entityCount >= this.options.maxEntityCount) {
                                throw new Error(
                                    `Entity count (${entityCount + 1}) exceeds maximum allowed (${this.options.maxEntityCount})`
                                );
                            }
                            //const escaped = entityName.replace(/[.\-+*:]/g, '\\.');
                            const escaped = entityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            entities[entityName] = {
                                regx: RegExp(`&${escaped};`, "g"),
                                val: val
                            };
                            entityCount++;
                        }
                    }
                    else if (hasBody && hasSeq(xmlData, "!ELEMENT", i)) {
                        i += 8;//Not supported
                        const { index } = this.readElementExp(xmlData, i + 1);
                        i = index;
                    } else if (hasBody && hasSeq(xmlData, "!ATTLIST", i)) {
                        i += 8;//Not supported
                        // const {index} = this.readAttlistExp(xmlData,i+1);
                        // i = index;
                    } else if (hasBody && hasSeq(xmlData, "!NOTATION", i)) {
                        i += 9;//Not supported
                        const { index } = this.readNotationExp(xmlData, i + 1, this.suppressValidationErr);
                        i = index;
                    } else if (hasSeq(xmlData, "!--", i)) comment = true;
                    else throw new Error(`Invalid DOCTYPE`);

                    angleBracketsCount++;
                    exp = "";
                } else if (xmlData[i] === '>') { //Read tag content
                    if (comment) {
                        if (xmlData[i - 1] === "-" && xmlData[i - 2] === "-") {
                            comment = false;
                            angleBracketsCount--;
                        }
                    } else {
                        angleBracketsCount--;
                    }
                    if (angleBracketsCount === 0) {
                        break;
                    }
                } else if (xmlData[i] === '[') {
                    hasBody = true;
                } else {
                    exp += xmlData[i];
                }
            }
            if (angleBracketsCount !== 0) {
                throw new Error(`Unclosed DOCTYPE`);
            }
        } else {
            throw new Error(`Invalid Tag instead of DOCTYPE`);
        }
        return { entities, i };
    }
    readEntityExp(xmlData, i) {
        //External entities are not supported
        //    <!ENTITY ext SYSTEM "http://normal-website.com" >

        //Parameter entities are not supported
        //    <!ENTITY entityname "&anotherElement;">

        //Internal entities are supported
        //    <!ENTITY entityname "replacement text">

        // Skip leading whitespace after <!ENTITY
        i = skipWhitespace(xmlData, i);

        // Read entity name
        let entityName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i]) && xmlData[i] !== '"' && xmlData[i] !== "'") {
            entityName += xmlData[i];
            i++;
        }
        validateEntityName(entityName);

        // Skip whitespace after entity name
        i = skipWhitespace(xmlData, i);

        // Check for unsupported constructs (external entities or parameter entities)
        if (!this.suppressValidationErr) {
            if (xmlData.substring(i, i + 6).toUpperCase() === "SYSTEM") {
                throw new Error("External entities are not supported");
            } else if (xmlData[i] === "%") {
                throw new Error("Parameter entities are not supported");
            }
        }

        // Read entity value (internal entity)
        let entityValue = "";
        [i, entityValue] = this.readIdentifierVal(xmlData, i, "entity");

        // Validate entity size
        if (this.options.enabled !== false &&
            this.options.maxEntitySize &&
            entityValue.length > this.options.maxEntitySize) {
            throw new Error(
                `Entity "${entityName}" size (${entityValue.length}) exceeds maximum allowed size (${this.options.maxEntitySize})`
            );
        }

        i--;
        return [entityName, entityValue, i];
    }

    readNotationExp(xmlData, i) {
        // Skip leading whitespace after <!NOTATION
        i = skipWhitespace(xmlData, i);

        // Read notation name
        let notationName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            notationName += xmlData[i];
            i++;
        }
        !this.suppressValidationErr && validateEntityName(notationName);

        // Skip whitespace after notation name
        i = skipWhitespace(xmlData, i);

        // Check identifier type (SYSTEM or PUBLIC)
        const identifierType = xmlData.substring(i, i + 6).toUpperCase();
        if (!this.suppressValidationErr && identifierType !== "SYSTEM" && identifierType !== "PUBLIC") {
            throw new Error(`Expected SYSTEM or PUBLIC, found "${identifierType}"`);
        }
        i += identifierType.length;

        // Skip whitespace after identifier type
        i = skipWhitespace(xmlData, i);

        // Read public identifier (if PUBLIC)
        let publicIdentifier = null;
        let systemIdentifier = null;

        if (identifierType === "PUBLIC") {
            [i, publicIdentifier] = this.readIdentifierVal(xmlData, i, "publicIdentifier");

            // Skip whitespace after public identifier
            i = skipWhitespace(xmlData, i);

            // Optionally read system identifier
            if (xmlData[i] === '"' || xmlData[i] === "'") {
                [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");
            }
        } else if (identifierType === "SYSTEM") {
            // Read system identifier (mandatory for SYSTEM)
            [i, systemIdentifier] = this.readIdentifierVal(xmlData, i, "systemIdentifier");

            if (!this.suppressValidationErr && !systemIdentifier) {
                throw new Error("Missing mandatory system identifier for SYSTEM notation");
            }
        }

        return { notationName, publicIdentifier, systemIdentifier, index: --i };
    }

    readIdentifierVal(xmlData, i, type) {
        let identifierVal = "";
        const startChar = xmlData[i];
        if (startChar !== '"' && startChar !== "'") {
            throw new Error(`Expected quoted string, found "${startChar}"`);
        }
        i++;

        while (i < xmlData.length && xmlData[i] !== startChar) {
            identifierVal += xmlData[i];
            i++;
        }

        if (xmlData[i] !== startChar) {
            throw new Error(`Unterminated ${type} value`);
        }
        i++;
        return [i, identifierVal];
    }

    readElementExp(xmlData, i) {
        // <!ELEMENT br EMPTY>
        // <!ELEMENT div ANY>
        // <!ELEMENT title (#PCDATA)>
        // <!ELEMENT book (title, author+)>
        // <!ELEMENT name (content-model)>

        // Skip leading whitespace after <!ELEMENT
        i = skipWhitespace(xmlData, i);

        // Read element name
        let elementName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            elementName += xmlData[i];
            i++;
        }

        // Validate element name
        if (!this.suppressValidationErr && !isName(elementName)) {
            throw new Error(`Invalid element name: "${elementName}"`);
        }

        // Skip whitespace after element name
        i = skipWhitespace(xmlData, i);
        let contentModel = "";
        // Expect '(' to start content model
        if (xmlData[i] === "E" && hasSeq(xmlData, "MPTY", i)) i += 4;
        else if (xmlData[i] === "A" && hasSeq(xmlData, "NY", i)) i += 2;
        else if (xmlData[i] === "(") {
            i++; // Move past '('

            // Read content model
            while (i < xmlData.length && xmlData[i] !== ")") {
                contentModel += xmlData[i];
                i++;
            }
            if (xmlData[i] !== ")") {
                throw new Error("Unterminated content model");
            }

        } else if (!this.suppressValidationErr) {
            throw new Error(`Invalid Element Expression, found "${xmlData[i]}"`);
        }

        return {
            elementName,
            contentModel: contentModel.trim(),
            index: i
        };
    }

    readAttlistExp(xmlData, i) {
        // Skip leading whitespace after <!ATTLIST
        i = skipWhitespace(xmlData, i);

        // Read element name
        let elementName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            elementName += xmlData[i];
            i++;
        }

        // Validate element name
        validateEntityName(elementName);

        // Skip whitespace after element name
        i = skipWhitespace(xmlData, i);

        // Read attribute name
        let attributeName = "";
        while (i < xmlData.length && !/\s/.test(xmlData[i])) {
            attributeName += xmlData[i];
            i++;
        }

        // Validate attribute name
        if (!validateEntityName(attributeName)) {
            throw new Error(`Invalid attribute name: "${attributeName}"`);
        }

        // Skip whitespace after attribute name
        i = skipWhitespace(xmlData, i);

        // Read attribute type
        let attributeType = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "NOTATION") {
            attributeType = "NOTATION";
            i += 8; // Move past "NOTATION"

            // Skip whitespace after "NOTATION"
            i = skipWhitespace(xmlData, i);

            // Expect '(' to start the list of notations
            if (xmlData[i] !== "(") {
                throw new Error(`Expected '(', found "${xmlData[i]}"`);
            }
            i++; // Move past '('

            // Read the list of allowed notations
            let allowedNotations = [];
            while (i < xmlData.length && xmlData[i] !== ")") {
                let notation = "";
                while (i < xmlData.length && xmlData[i] !== "|" && xmlData[i] !== ")") {
                    notation += xmlData[i];
                    i++;
                }

                // Validate notation name
                notation = notation.trim();
                if (!validateEntityName(notation)) {
                    throw new Error(`Invalid notation name: "${notation}"`);
                }

                allowedNotations.push(notation);

                // Skip '|' separator or exit loop
                if (xmlData[i] === "|") {
                    i++; // Move past '|'
                    i = skipWhitespace(xmlData, i); // Skip optional whitespace after '|'
                }
            }

            if (xmlData[i] !== ")") {
                throw new Error("Unterminated list of notations");
            }
            i++; // Move past ')'

            // Store the allowed notations as part of the attribute type
            attributeType += " (" + allowedNotations.join("|") + ")";
        } else {
            // Handle simple types (e.g., CDATA, ID, IDREF, etc.)
            while (i < xmlData.length && !/\s/.test(xmlData[i])) {
                attributeType += xmlData[i];
                i++;
            }

            // Validate simple attribute type
            const validTypes = ["CDATA", "ID", "IDREF", "IDREFS", "ENTITY", "ENTITIES", "NMTOKEN", "NMTOKENS"];
            if (!this.suppressValidationErr && !validTypes.includes(attributeType.toUpperCase())) {
                throw new Error(`Invalid attribute type: "${attributeType}"`);
            }
        }

        // Skip whitespace after attribute type
        i = skipWhitespace(xmlData, i);

        // Read default value
        let defaultValue = "";
        if (xmlData.substring(i, i + 8).toUpperCase() === "#REQUIRED") {
            defaultValue = "#REQUIRED";
            i += 8;
        } else if (xmlData.substring(i, i + 7).toUpperCase() === "#IMPLIED") {
            defaultValue = "#IMPLIED";
            i += 7;
        } else {
            [i, defaultValue] = this.readIdentifierVal(xmlData, i, "ATTLIST");
        }

        return {
            elementName,
            attributeName,
            attributeType,
            defaultValue,
            index: i
        }
    }
}



const skipWhitespace = (data, index) => {
    while (index < data.length && /\s/.test(data[index])) {
        index++;
    }
    return index;
};



function hasSeq(data, seq, i) {
    for (let j = 0; j < seq.length; j++) {
        if (seq[j] !== data[i + j + 1]) return false;
    }
    return true;
}

function validateEntityName(name) {
    if (isName(name))
        return name;
    else
        throw new Error(`Invalid entity name ${name}`);
}

/**
 * Flat lookup table: maps Unicode code point → ASCII digit (0-9).
 * Only decimal digit characters (Unicode category Nd) are included.
 *
 * Strategy: Int32Array of size (maxCodePoint - minCodePoint + 1).
 * Value 0xFF means "not a digit". Value 0-9 is the ASCII digit value.
 * This gives O(1) lookup with no branching, no bisect, no loop.
 *
 * Memory: range is 0x0660 to 0x1FBF0 → ~129,936 entries × 1 byte = ~127 KB.
 * Acceptable for a one-time init; lookup is a single array index.
 */

// All known Unicode Nd (decimal digit) script zero code points.
// Each script has exactly 10 consecutive digits: zero+0 .. zero+9.
const SCRIPT_ZEROS = [
  // Basic Latin (ASCII) — included for completeness / pass-through
  0x0030, // 0-9

  // Arabic scripts
  0x0660, // Arabic-Indic ٠١٢٣٤٥٦٧٨٩
  0x06F0, // Extended Arabic-Indic (Urdu/Persian/Sindhi) ۰۱۲۳

  // Indic scripts
  0x0966, // Devanagari ०१२३४५६७८९
  0x09E6, // Bengali ০১২৩৪৫৬৭৮৯
  0x0A66, // Gurmukhi ੦੧੨੩੪੫੬੭੮੯
  0x0AE6, // Gujarati ૦૧૨૩૪૫૬૭૮૯
  0x0B66, // Odia ୦୧୨୩୪୫୬୭୮୯
  0x0BE6, // Tamil ௦௧௨௩௪௫௬௭௮௯
  0x0C66, // Telugu ౦౧౨౩౪౫౬౭౮౯
  0x0CE6, // Kannada ೦೧೨೩೪೫೬೭೮೯
  0x0D66, // Malayalam ൦൧൨൩൪൫൬൭൮൯
  0x0DE6, // Sinhala Archaic ෦෧෨෩෪෫෬෭෮෯

  // Southeast Asian scripts
  0x0E50, // Thai ๐๑๒๓๔๕๖๗๘๙
  0x0ED0, // Lao ໐໑໒໓໔໕໖໗໘໙
  0x0F20, // Tibetan ༠༡༢༣༤༥༦༧༨༩
  0x1040, // Myanmar ၀၁၂၃၄၅၆၇၈၉
  0x1090, // Myanmar Shan ႐႑႒႓႔႕႖႗႘႙
  0x17E0, // Khmer ០១២៣៤៥៦៧៨៩
  0x1810, // Mongolian ᠐᠑᠒᠓᠔᠕᠖᠗᠘᠙
  0x1946, // Limbu ᥆᥇᥈᥉᥊᥋᥌᥍᥎᥏
  0x19D0, // New Tai Lue ᧐᧑᧒᧓᧔᧕᧖᧗᧘᧙
  0x1A80, // Tai Tham Hora ᪀᪁᪂᪃᪄᪅᪆᪇᪈᪉
  0x1A90, // Tai Tham Tham ᪐᪑᪒᪓᪔᪕᪖᪗᪘᪙
  0x1B50, // Balinese ᭐᭑᭒᭓᭔᭕᭖᭗᭘᭙
  0x1BB0, // Sundanese ᮰᮱᮲᮳᮴᮵᮶᮷᮸᮹
  0x1C40, // Lepcha ᱀᱁᱂᱃᱄᱅᱆᱇᱈᱉
  0x1C50, // Ol Chiki ᱐᱑᱒᱓᱔᱕᱖᱗᱘᱙

  // Fullwidth (CJK context)
  0xFF10, // Fullwidth ０１２３４５６７８９

  // Mathematical digit variants (Unicode math block)
  0x1D7CE, // Mathematical Bold
  0x1D7D8, // Mathematical Double-Struck
  0x1D7E2, // Mathematical Sans-Serif
  0x1D7EC, // Mathematical Sans-Serif Bold
  0x1D7F6, // Mathematical Monospace

  // Other scripts
  0x104A0, // Osmanya 𐒠𐒡𐒢𐒣𐒤𐒥𐒦𐒧𐒨𐒩
  0x10D30, // Hanifi Rohingya 𐴰𐴱𐴲𐴳𐴴𐴵𐴶𐴷𐴸𐴹
  0x11066, // Brahmi 𑁦𑁧𑁨𑁩𑁪𑁫𑁬𑁭𑁮𑁯
  0x110F0, // Sora Sompeng 𑃰𑃱𑃲𑃳𑃴𑃵𑃶𑃷𑃸𑃹
  0x11136, // Chakma 𑄶𑄷𑄸𑄹𑄺𑄻𑄼𑄽𑄾𑄿
  0x111D0, // Sharada 𑇐𑇑𑇒𑇓𑇔𑇕𑇖𑇗𑇘𑇙
  0x112F0, // Khudawadi 𑋰𑋱𑋲𑋳𑋴𑋵𑋶𑋷𑋸𑋹
  0x11450, // Newa 𑑐𑑑𑑒𑑓𑑔𑑕𑑖𑑗𑑘𑑙
  0x114D0, // Tirhuta 𑓐𑓑𑓒𑓓𑓔𑓕𑓖𑓗𑓘𑓙
  0x11650, // Modi 𑙐𑙑𑙒𑙓𑙔𑙕𑙖𑙗𑙘𑙙
  0x116C0, // Takri 𑛀𑛁𑛂𑛃𑛄𑛅𑛆𑛇𑛈𑛉
  0x11730, // Ahom 𑜰𑜱𑜲𑜳𑜴𑜵𑜶𑜷𑜸𑜹
  0x118E0, // Warang Citi 𑣠𑣡𑣢𑣣𑣤𑣥𑣦𑣧𑣨𑣩
  0x11950, // Dives Akuru 𑥐𑥑𑥒𑥓𑥔𑥕𑥖𑥗𑥘𑥙
  0x11BF0, // Khitan Small Script 𑯰𑯱𑯲𑯳𑯴𑯵𑯶𑯷𑯸𑯹
  0x11C50, // Bhaiksuki 𑱐𑱑𑱒𑱓𑱔𑱕𑱖𑱗𑱘𑱙
  0x11D50, // Masaram Gondi 𑵐𑵑𑵒𑵓𑵔𑵕𑵖𑵗𑵘𑵙
  0x11DA0, // Gunjala Gondi 𑶠𑶡𑶢𑶣𑶤𑶥𑶦𑶧𑶨𑶩
  0x11F50, // Kawi 𑽐𑽑𑽒𑽓𑽔𑽕𑽖𑽗𑽘𑽙
  0x16A60, // Mro 𖩠𖩡𖩢𖩣𖩤𖩥𖩦𖩧𖩨𖩩
  0x16AC0, // Tangsa 𖫀𖫁𖫂𖫃𖫄𖫅𖫆𖫇𖫈𖫉
  0x16B50, // Pahawh Hmong 𖭐𖭑𖭒𖭓𖭔𖭕𖭖𖭗𖭘𖭙
  0x1E140, // Nyiakeng Puachue Hmong 𞅀𞅁𞅂𞅃𞅄𞅅𞅆𞅇𞅈𞅉
  0x1E2F0, // Wancho 𞋰𞋱𞋲𞋳𞋴𞋵𞋶𞋷𞋸𞋹
  0x1E4F0, // Nag Mundari 𞓰𞓱𞓲𞓳𞓴𞓵𞓶𞓷𞓸𞓹
  0x1E950, // Adlam 𞥐𞥑𞥒𞥓𞥔𞥕𞥖𞥗𞥘𞥙
  0x1FBF0, // Segmented digit symbols 🯰🯱🯲🯳🯴🯵🯶🯷🯸🯹
];

// Build a sparse Map for scripts above 0xFFFF (surrogate-pair range).
// These can't go into a flat Uint8Array indexed by code point efficiently.
const NOT_DIGIT = 0xFF;
const HIGH_MAP = new Map(); // codePoint → digit value (0-9)

const LOW_MAX = 0xFFFF;
const LOW_MIN = 0x0660; // first non-ASCII digit script

// Flat Uint8Array covering 0x0660 .. 0xFFFF
const TABLE_OFFSET = LOW_MIN;
const TABLE_SIZE = LOW_MAX - LOW_MIN + 1;
const TABLE = new Uint8Array(TABLE_SIZE).fill(NOT_DIGIT);

for (const zero of SCRIPT_ZEROS) {
  for (let d = 0; d < 10; d++) {
    const cp = zero + d;
    if (cp <= LOW_MAX) {
      TABLE[cp - TABLE_OFFSET] = d;
    } else {
      HIGH_MAP.set(cp, d);
    }
  }
}

const CHAR_0 = 48; // '0'.charCodeAt(0)
const CHAR_9 = 57; // '9'.charCodeAt(0)
const CHAR_MINUS = 45; // '-'.charCodeAt(0)

// Unicode minus/hyphen variants worth normalizing to ASCII '-' in numeric context:
//   U+2212  MINUS SIGN       − (mathematically correct minus)
//   U+FF0D  FULLWIDTH HYPHEN-MINUS  － (Japanese fullwidth context)
//   U+FE63  SMALL HYPHEN-MINUS     ﹣ (small form variant)
//
// NOT normalized (deliberate):
//   U+2013  EN DASH  –  (punctuation, not a numeric sign)
//   U+2014  EM DASH  —  (punctuation)
//   U+2010  HYPHEN   ‐  (typographic hyphen)
//
// Rationale: only characters a human or locale formatter would plausibly use
// as a numeric minus sign are normalized. Dashes used for punctuation are left
// alone to avoid mangling non-numeric strings.
const MINUS_SET = new Set([0x2212, 0xFF0D, 0xFE63]);

/**
 * Normalize all Unicode decimal digit characters in a string to ASCII (0-9),
 * and normalize Unicode minus variants to ASCII '-' (U+002D).
 *
 * Non-digit, non-minus characters are passed through unchanged.
 *
 * Performance design:
 * - Fast path: if the string has no convertible characters, return it unchanged
 *   (zero allocation).
 * - BMP digits (0x0660..0xFFFF excl. surrogates): flat Uint8Array lookup (O(1)).
 * - Supplementary plane digits (> 0xFFFF, encoded as surrogate pairs): Map lookup.
 * - Minus variants: checked inline with a small fixed Set.
 *
 * @param {string} str
 * @returns {string}
 */
function anynum(str) {
  if (typeof str !== 'string') return str;

  const len = str.length;
  if (len === 0) return str;

  // Scan for first character needing conversion.
  // If none found, return original string (zero allocation).
  let firstHit = -1;

  for (let i = 0; i < len; i++) {
    const cc = str.charCodeAt(i);

    // ASCII digit or ASCII minus — already normalized, skip fast
    if ((cc >= CHAR_0 && cc <= CHAR_9) || cc === CHAR_MINUS) continue;

    // Below first unicode digit script — check minus variants only
    if (cc < TABLE_OFFSET) {
      if (MINUS_SET.has(cc)) { firstHit = i; break; }
      continue;
    }

    // Surrogate pairs live in BMP range 0xD800-0xDFFF — check before TABLE
    if (cc >= 0xD800 && cc <= 0xDBFF) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 0xDC00 && low <= 0xDFFF) {
          const cp = 0x10000 + ((cc - 0xD800) << 10) + (low - 0xDC00);
          if (HIGH_MAP.has(cp)) { firstHit = i; break; }
        }
      }
      continue;
    }

    // BMP non-surrogate: flat table lookup; also check minus variants in this range
    if (TABLE[cc - TABLE_OFFSET] !== NOT_DIGIT || MINUS_SET.has(cc)) {
      firstHit = i;
      break;
    }
  }

  // Nothing to replace — return original, zero allocation
  if (firstHit === -1) return str;

  // Build result: copy unchanged prefix, then convert from firstHit onward
  const chars = [];

  if (firstHit > 0) chars.push(str.slice(0, firstHit));

  for (let i = firstHit; i < len; i++) {
    const cc = str.charCodeAt(i);

    // ASCII digit or ASCII minus — pass through
    if ((cc >= CHAR_0 && cc <= CHAR_9) || cc === CHAR_MINUS) {
      chars.push(str[i]);
      continue;
    }

    // Below TABLE_OFFSET — check minus variants, else pass through
    if (cc < TABLE_OFFSET) {
      chars.push(MINUS_SET.has(cc) ? '-' : str[i]);
      continue;
    }

    // Surrogate pairs
    if (cc >= 0xD800 && cc <= 0xDBFF) {
      if (i + 1 < len) {
        const low = str.charCodeAt(i + 1);
        if (low >= 0xDC00 && low <= 0xDFFF) {
          const cp = 0x10000 + ((cc - 0xD800) << 10) + (low - 0xDC00);
          const d = HIGH_MAP.get(cp);
          if (d !== undefined) {
            chars.push(String.fromCharCode(d + 48));
            i++; // consume low surrogate
            continue;
          }
        }
      }
      chars.push(str[i]);
      continue;
    }

    // BMP non-surrogate: flat table lookup + minus variants
    if (MINUS_SET.has(cc)) {
      chars.push('-');
      continue;
    }
    const d = TABLE[cc - TABLE_OFFSET];
    chars.push(d !== NOT_DIGIT ? String.fromCharCode(d + 48) : str[i]);
  }

  return chars.join('');
}

const hexRegex = /^[-+]?0x[a-fA-F0-9]+$/;
const binRegex = /^0b[01]+$/;
const octRegex = /^0o[0-7]+$/;
const numRegex = /^([\-\+])?(0*)([0-9]*(\.[0-9]*)?)$/;

const consider = {
    hex: true,
    binary: false,
    octal: false,
    leadingZeros: true,
    decimalPoint: "\.",
    eNotation: true,
    //skipLike: /regex/,
    infinity: "original", // "null", "infinity" (Infinity type), "string" ("Infinity" (the string literal))
    unicode: false,
};

function toNumber(str, options = {}) {
    options = Object.assign({}, consider, options);
    if (!str || typeof str !== "string") return str;

    let trimmedStr = str.trim();

    if (trimmedStr.length === 0) return str;
    else if (options.skipLike !== undefined && options.skipLike.test(trimmedStr)) return str;
    else if (trimmedStr === "0") return 0;

    if (options.unicode) {
        trimmedStr = anynum(trimmedStr);
        if (trimmedStr === "0") return 0; // re-check after normalization
    }
    if (options.hex && hexRegex.test(trimmedStr)) {
        return parse_int(trimmedStr, 16);
    } else if (options.binary && binRegex.test(trimmedStr)) {
        return parse_int(trimmedStr, 2);
    } else if (options.octal && octRegex.test(trimmedStr)) {
        return parse_int(trimmedStr, 8);
    } else if (!isFinite(trimmedStr)) { //Infinity
        return handleInfinity(str, Number(trimmedStr), options);
    } else if (trimmedStr.includes('e') || trimmedStr.includes('E')) { //eNotation
        return resolveEnotation(str, trimmedStr, options);
    } else {
        //separate negative sign, leading zeros, and rest number
        const match = numRegex.exec(trimmedStr);
        // +00.123 => [ , '+', '00', '.123', ..
        if (match) {
            const sign = match[1] || "";
            const leadingZeros = match[2];
            let numTrimmedByZeros = trimZeros(match[3]); //complete num without leading zeros
            const decimalAdjacentToLeadingZeros = sign ? // 0., -00., 000.
                str[leadingZeros.length + 1] === "."
                : str[leadingZeros.length] === ".";

            //trim ending zeros for floating number
            if (!options.leadingZeros //leading zeros are not allowed
                && (leadingZeros.length > 1
                    || (leadingZeros.length === 1 && !decimalAdjacentToLeadingZeros))) {
                // 00, 00.3, +03.24, 03, 03.24
                return str;
            }
            else {//no leading zeros or leading zeros are allowed
                const num = Number(trimmedStr);
                const parsedStr = String(num);

                if (num === 0) return num;
                if (parsedStr.search(/[eE]/) !== -1) { //given number is long and parsed to eNotation
                    if (options.eNotation) return num;
                    else return str;
                } else if (trimmedStr.indexOf(".") !== -1) { //floating number
                    if (parsedStr === "0") return num; //0.0
                    else if (parsedStr === numTrimmedByZeros) return num; //0.456. 0.79000
                    else if (parsedStr === `${sign}${numTrimmedByZeros}`) return num;
                    else return str;
                }

                let n = leadingZeros ? numTrimmedByZeros : trimmedStr;
                if (leadingZeros) {
                    // -009 => -9
                    return (n === parsedStr) || (sign + n === parsedStr) ? num : str
                } else {
                    // +9
                    return (n === parsedStr) || (n === sign + parsedStr) ? num : str
                }
            }
        } else { //non-numeric string
            return str;
        }
    }
}

const eNotationRegx = /^([-+])?(0*)(\d*(\.\d*)?[eE][-\+]?\d+)$/;
function resolveEnotation(str, trimmedStr, options) {
    if (!options.eNotation) return str;
    const notation = trimmedStr.match(eNotationRegx);
    if (notation) {
        let sign = notation[1] || "";
        const eChar = notation[3].indexOf("e") === -1 ? "E" : "e";
        const leadingZeros = notation[2];
        const eAdjacentToLeadingZeros = sign ? // 0E.
            str[leadingZeros.length + 1] === eChar
            : str[leadingZeros.length] === eChar;

        if (leadingZeros.length > 1 && eAdjacentToLeadingZeros) return str;
        else if (leadingZeros.length === 1
            && (notation[3].startsWith(`.${eChar}`) || notation[3][0] === eChar)) {
            return Number(trimmedStr);
        } else if (leadingZeros.length > 0) {
            // Has leading zeros — only accept if leadingZeros option allows it
            if (options.leadingZeros && !eAdjacentToLeadingZeros) {
                trimmedStr = (notation[1] || "") + notation[3];
                return Number(trimmedStr);
            } else return str;
        } else {
            // No leading zeros — always valid e-notation, parse it
            return Number(trimmedStr);
        }
    } else {
        return str;
    }
}

/**
 * 
 * @param {string} numStr without leading zeros
 * @returns 
 */
function trimZeros(numStr) {
    if (numStr && numStr.indexOf(".") !== -1) {//float
        numStr = numStr.replace(/0+$/, ""); //remove ending zeros
        if (numStr === ".") numStr = "0";
        else if (numStr[0] === ".") numStr = "0" + numStr;
        else if (numStr[numStr.length - 1] === ".") numStr = numStr.substring(0, numStr.length - 1);
        return numStr;
    }
    return numStr;
}

function parse_int(numStr, base) {
    const str = numStr.trim();
    if (base === 2 || base === 8) numStr = str.substring(2);

    if (parseInt) return parseInt(numStr, base);
    else if (Number.parseInt) return Number.parseInt(numStr, base);
    else if (window && window.parseInt) return window.parseInt(numStr, base);
    else throw new Error("parseInt, Number.parseInt, window.parseInt are not supported");
}

/**
 * Handle infinite values based on user option
 * @param {string} str - original input string
 * @param {number} num - parsed number (Infinity or -Infinity)
 * @param {object} options - user options
 * @returns {string|number|null} based on infinity option
 */
function handleInfinity(str, num, options) {
    const isPositive = num === Infinity;

    switch (options.infinity.toLowerCase()) {
        case "null":
            return null;
        case "infinity":
            return num; // Return Infinity or -Infinity
        case "string":
            return isPositive ? "Infinity" : "-Infinity";
        case "original":
        default:
            return str; // Return original string like "1e1000"
    }
}

function getIgnoreAttributesFn(ignoreAttributes) {
    if (typeof ignoreAttributes === 'function') {
        return ignoreAttributes
    }
    if (Array.isArray(ignoreAttributes)) {
        return (attrName) => {
            for (const pattern of ignoreAttributes) {
                if (typeof pattern === 'string' && attrName === pattern) {
                    return true
                }
                if (pattern instanceof RegExp && pattern.test(attrName)) {
                    return true
                }
            }
        }
    }
    return () => false
}

/**
 * Expression - Parses and stores a tag pattern expression
 * 
 * Patterns are parsed once and stored in an optimized structure for fast matching.
 * 
 * @example
 * const expr = new Expression("root.users.user");
 * const expr2 = new Expression("..user[id]:first");
 * const expr3 = new Expression("root/users/user", { separator: '/' });
 */
class Expression {
  /**
   * Create a new Expression
   * @param {string} pattern - Pattern string (e.g., "root.users.user", "..user[id]")
   * @param {Object} options - Configuration options
   * @param {string} options.separator - Path separator (default: '.')
   */
  constructor(pattern, options = {}, data) {
    this.pattern = pattern;
    this.separator = options.separator || '.';
    this.segments = this._parse(pattern);
    this.data = data;
    // Cache expensive checks for performance (O(1) instead of O(n))
    this._hasDeepWildcard = this.segments.some(seg => seg.type === 'deep-wildcard');
    this._hasAttributeCondition = this.segments.some(seg => seg.attrName !== undefined);
    this._hasPositionSelector = this.segments.some(seg => seg.position !== undefined);
  }

  /**
   * Parse pattern string into segments
   * @private
   * @param {string} pattern - Pattern to parse
   * @returns {Array} Array of segment objects
   */
  _parse(pattern) {
    const segments = [];

    // Split by separator but handle ".." specially
    let i = 0;
    let currentPart = '';

    while (i < pattern.length) {
      if (pattern[i] === this.separator) {
        // Check if next char is also separator (deep wildcard)
        if (i + 1 < pattern.length && pattern[i + 1] === this.separator) {
          // Flush current part if any
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
            currentPart = '';
          }
          // Add deep wildcard
          segments.push({ type: 'deep-wildcard' });
          i += 2; // Skip both separators
        } else {
          // Regular separator
          if (currentPart.trim()) {
            segments.push(this._parseSegment(currentPart.trim()));
          }
          currentPart = '';
          i++;
        }
      } else {
        currentPart += pattern[i];
        i++;
      }
    }

    // Flush remaining part
    if (currentPart.trim()) {
      segments.push(this._parseSegment(currentPart.trim()));
    }

    return segments;
  }

  /**
   * Parse a single segment
   * @private
   * @param {string} part - Segment string (e.g., "user", "ns::user", "user[id]", "ns::user:first")
   * @returns {Object} Segment object
   */
  _parseSegment(part) {
    const segment = { type: 'tag' };

    // NEW NAMESPACE SYNTAX (v2.0):
    // ============================
    // Namespace uses DOUBLE colon (::)
    // Position uses SINGLE colon (:)
    // 
    // Examples:
    //   "user"              → tag
    //   "user:first"        → tag + position
    //   "user[id]"          → tag + attribute
    //   "user[id]:first"    → tag + attribute + position
    //   "ns::user"          → namespace + tag
    //   "ns::user:first"    → namespace + tag + position
    //   "ns::user[id]"      → namespace + tag + attribute
    //   "ns::user[id]:first" → namespace + tag + attribute + position
    //   "ns::first"         → namespace + tag named "first" (NO ambiguity!)
    //
    // This eliminates all ambiguity:
    //   :: = namespace separator
    //   :  = position selector
    //   [] = attributes

    // Step 1: Extract brackets [attr] or [attr=value]
    let bracketContent = null;
    let withoutBrackets = part;

    const bracketMatch = part.match(/^([^\[]+)(\[[^\]]*\])(.*)$/);
    if (bracketMatch) {
      withoutBrackets = bracketMatch[1] + bracketMatch[3];
      if (bracketMatch[2]) {
        const content = bracketMatch[2].slice(1, -1);
        if (content) {
          bracketContent = content;
        }
      }
    }

    // Step 2: Check for namespace (double colon ::)
    let namespace = undefined;
    let tagAndPosition = withoutBrackets;

    if (withoutBrackets.includes('::')) {
      const nsIndex = withoutBrackets.indexOf('::');
      namespace = withoutBrackets.substring(0, nsIndex).trim();
      tagAndPosition = withoutBrackets.substring(nsIndex + 2).trim(); // Skip ::

      if (!namespace) {
        throw new Error(`Invalid namespace in pattern: ${part}`);
      }
    }

    // Step 3: Parse tag and position (single colon :)
    let tag = undefined;
    let positionMatch = null;

    if (tagAndPosition.includes(':')) {
      const colonIndex = tagAndPosition.lastIndexOf(':'); // Use last colon for position
      const tagPart = tagAndPosition.substring(0, colonIndex).trim();
      const posPart = tagAndPosition.substring(colonIndex + 1).trim();

      // Verify position is a valid keyword
      const isPositionKeyword = ['first', 'last', 'odd', 'even'].includes(posPart) ||
        /^nth\(\d+\)$/.test(posPart);

      if (isPositionKeyword) {
        tag = tagPart;
        positionMatch = posPart;
      } else {
        // Not a valid position keyword, treat whole thing as tag
        tag = tagAndPosition;
      }
    } else {
      tag = tagAndPosition;
    }

    if (!tag) {
      throw new Error(`Invalid segment pattern: ${part}`);
    }

    segment.tag = tag;
    if (namespace) {
      segment.namespace = namespace;
    }

    // Step 4: Parse attributes
    if (bracketContent) {
      if (bracketContent.includes('=')) {
        const eqIndex = bracketContent.indexOf('=');
        segment.attrName = bracketContent.substring(0, eqIndex).trim();
        segment.attrValue = bracketContent.substring(eqIndex + 1).trim();
      } else {
        segment.attrName = bracketContent.trim();
      }
    }

    // Step 5: Parse position selector
    if (positionMatch) {
      const nthMatch = positionMatch.match(/^nth\((\d+)\)$/);
      if (nthMatch) {
        segment.position = 'nth';
        segment.positionValue = parseInt(nthMatch[1], 10);
      } else {
        segment.position = positionMatch;
      }
    }

    return segment;
  }

  /**
   * Get the number of segments
   * @returns {number}
   */
  get length() {
    return this.segments.length;
  }

  /**
   * Check if expression contains deep wildcard
   * @returns {boolean}
   */
  hasDeepWildcard() {
    return this._hasDeepWildcard;
  }

  /**
   * Check if expression has attribute conditions
   * @returns {boolean}
   */
  hasAttributeCondition() {
    return this._hasAttributeCondition;
  }

  /**
   * Check if expression has position selectors
   * @returns {boolean}
   */
  hasPositionSelector() {
    return this._hasPositionSelector;
  }

  /**
   * Get string representation
   * @returns {string}
   */
  toString() {
    return this.pattern;
  }
}

/**
 * MatcherView - A lightweight read-only view over a Matcher's internal state.
 *
 * Created once by Matcher and reused across all callbacks. Holds a direct
 * reference to the parent Matcher so it always reflects current parser state
 * with zero copying or freezing overhead.
 *
 * Users receive this via {@link Matcher#readOnly} or directly from parser
 * callbacks. It exposes all query and matching methods but has no mutation
 * methods — misuse is caught at the TypeScript level rather than at runtime.
 *
 * @example
 * const matcher = new Matcher();
 * const view = matcher.readOnly();
 *
 * matcher.push("root", {});
 * view.getCurrentTag(); // "root"
 * view.getDepth();      // 1
 */
class MatcherView {
  /**
   * @param {Matcher} matcher - The parent Matcher instance to read from.
   */
  constructor(matcher) {
    this._matcher = matcher;
  }

  /**
   * Get the path separator used by the parent matcher.
   * @returns {string}
   */
  get separator() {
    return this._matcher.separator;
  }

  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].tag : undefined;
  }

  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    const path = this._matcher.path;
    return path.length > 0 ? path[path.length - 1].namespace : undefined;
  }

  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return undefined;
    return path[path.length - 1].values?.[attrName];
  }

  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    const path = this._matcher.path;
    if (path.length === 0) return false;
    const current = path[path.length - 1];
    return current.values !== undefined && attrName in current.values;
  }

  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {*}
   */
  getAnyParentAttr(attrName) {
    return this._matcher.getAnyParentAttr(attrName);
  }

  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    return this._matcher.hasAnyParentAttr(attrName);
  }

  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].position ?? 0;
  }

  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    const path = this._matcher.path;
    if (path.length === 0) return -1;
    return path[path.length - 1].counter ?? 0;
  }

  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }

  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this._matcher.path.length;
  }

  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    return this._matcher.toString(separator, includeNamespace);
  }

  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this._matcher.path.map(n => n.tag);
  }

  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    return this._matcher.matches(expression);
  }

  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this._matcher);
  }
}

/**
 * Matcher - Tracks current path in XML/JSON tree and matches against Expressions.
 *
 * The matcher maintains a stack of nodes representing the current path from root to
 * current tag. It only stores attribute values for the current (top) node to minimize
 * memory usage. Sibling tracking is used to auto-calculate position and counter.
 *
 * Use {@link Matcher#readOnly} to obtain a {@link MatcherView} safe to pass to
 * user callbacks — it always reflects current state with no Proxy overhead.
 *
 * @example
 * const matcher = new Matcher();
 * matcher.push("root", {});
 * matcher.push("users", {});
 * matcher.push("user", { id: "123", type: "admin" });
 *
 * const expr = new Expression("root.users.user");
 * matcher.matches(expr); // true
 */
class Matcher {
  /**
   * Create a new Matcher.
   * @param {Object} [options={}]
   * @param {string} [options.separator='.'] - Default path separator
   */
  constructor(options = {}) {
    this.separator = options.separator || '.';
    this.path = [];
    this.siblingStacks = [];
    // Each path node: { tag, values, position, counter, namespace? }
    // values only present for current (last) node
    // Each siblingStacks entry: Map<tagName, count> tracking occurrences at each level
    this._pathStringCache = null;
    this._view = new MatcherView(this);

    // Kept-attribute stack: only populated when push() is called with options.keep.
    this._keptAttrs = [];
  }

  /**
   * Push a new tag onto the path.
   * @param {string} tagName
   * @param {Object|null} [attrValues=null]
   * @param {string|null} [namespace=null]
   * @param {Object|null} [options=null]
   * @param {string[]} [options.keep] - Names of attributes (from attrValues)
   */
  push(tagName, attrValues = null, namespace = null, options = null) {
    this._pathStringCache = null;

    // Remove values from previous current node (now becoming ancestor)
    if (this.path.length > 0) {
      this.path[this.path.length - 1].values = undefined;
    }

    // Get or create sibling tracking for current level
    const currentLevel = this.path.length;
    let level = this.siblingStacks[currentLevel];
    if (!level) {
      // `counts` tells same-name siblings apart (the "counter" — nth <item>
      // among other <item>s). `total` is every child seen at this level so
      // far, kept as a running number instead of re-added from `counts` on
      // every push — a parent with many differently-named children would
      // otherwise cost more per child the more distinct names it has.
      level = { counts: new Map(), total: 0 };
      this.siblingStacks[currentLevel] = level;
    }

    // Create a unique key for sibling tracking that includes namespace
    const siblingKey = namespace ? `${namespace}:${tagName}` : tagName;

    // Calculate counter (how many times this tag appeared at this level)
    const counter = level.counts.get(siblingKey) || 0;

    // Position = total children at this level seen before this one.
    const position = level.total;

    // Update sibling count for this tag, and the level's running total.
    level.counts.set(siblingKey, counter + 1);
    level.total++;

    // Create new node
    const node = {
      tag: tagName,
      position: position,
      counter: counter
    };

    if (namespace !== null && namespace !== undefined) {
      node.namespace = namespace;
    }

    if (attrValues !== null && attrValues !== undefined) {
      node.values = attrValues;
    }

    this.path.push(node);

    // Depth of the node we just pushed (1-based, matches this.path.length)
    const depth = this.path.length;

    // Copy only the requested attributes into the kept-attrs stack. This is
    // the one part of push() whose cost scales with input (O(keep.length))
    // rather than being O(1) — by design, since the caller is explicitly
    // opting in for specific attribute names. No options/keep => zero added
    // cost beyond the two property reads below.
    const keep = options !== null ? options.keep : null;
    if (keep !== null && keep !== undefined && keep.length > 0 && attrValues) {
      for (let i = 0; i < keep.length; i++) {
        const name = keep[i];
        if (attrValues[name] !== undefined) {
          this._keptAttrs.push({ depth, name, value: attrValues[name] });
        }
      }
    }
  }

  /**
   * Pop the last tag from the path.
   * @returns {Object|undefined} The popped node
   */
  pop() {
    if (this.path.length === 0) return undefined;
    this._pathStringCache = null;

    const node = this.path.pop();

    if (this.siblingStacks.length > this.path.length + 1) {
      this.siblingStacks.length = this.path.length + 1;
    }

    // Drop any kept attributes that belonged to the popped node (or deeper).
    // _keptAttrs is depth-ordered (push only ever appends increasing depths),
    // so this is a backward scan that stops at the first surviving entry —
    // typically O(1) since kept attrs are rare by design.
    const poppedDepth = this.path.length + 1;
    while (
      this._keptAttrs.length > 0 &&
      this._keptAttrs[this._keptAttrs.length - 1].depth >= poppedDepth
    ) {
      this._keptAttrs.pop();
    }

    return node;
  }

  /**
   * Update current node's attribute values.
   * Useful when attributes are parsed after push.
   * @param {Object} attrValues
   */
  updateCurrent(attrValues) {
    if (this.path.length > 0) {
      const current = this.path[this.path.length - 1];
      if (attrValues !== null && attrValues !== undefined) {
        current.values = attrValues;
      }
    }
  }

  /**
   * Get current tag name.
   * @returns {string|undefined}
   */
  getCurrentTag() {
    return this.path.length > 0 ? this.path[this.path.length - 1].tag : undefined;
  }

  /**
   * Get current namespace.
   * @returns {string|undefined}
   */
  getCurrentNamespace() {
    return this.path.length > 0 ? this.path[this.path.length - 1].namespace : undefined;
  }

  /**
   * Get current node's attribute value.
   * @param {string} attrName
   * @returns {*}
   */
  getAttrValue(attrName) {
    if (this.path.length === 0) return undefined;
    return this.path[this.path.length - 1].values?.[attrName];
  }

  /**
   * Check if current node has an attribute.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAttr(attrName) {
    if (this.path.length === 0) return false;
    const current = this.path[this.path.length - 1];
    return current.values !== undefined && attrName in current.values;
  }

  /**
   * Get the value of a "kept" attribute from the nearest ancestor (or
   * current node) that declared it via `push(tag, attrs, ns, { keep: [...] })`.
   * Unlike getAttrValue(), this works regardless of how deep the path has
   * gone since the attribute was pushed — but only for attribute names that
   * were explicitly marked with `keep` at push time. Cost is proportional to
   * the number of currently-kept attributes (typically 0-3), not path depth.
   * @param {string} attrName
   * @returns {*} the value, or undefined if no ancestor kept this attribute
   */
  getAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return kept[i].value;
    }
    return undefined;
  }

  /**
   * Check whether any ancestor (or the current node) kept the given
   * attribute via `push(tag, attrs, ns, { keep: [...] })`.
   * @param {string} attrName
   * @returns {boolean}
   */
  hasAnyParentAttr(attrName) {
    const kept = this._keptAttrs;
    for (let i = kept.length - 1; i >= 0; i--) {
      if (kept[i].name === attrName) return true;
    }
    return false;
  }

  /**
   * Get current node's sibling position (child index in parent).
   * @returns {number}
   */
  getPosition() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].position ?? 0;
  }

  /**
   * Get current node's repeat counter (occurrence count of this tag name).
   * @returns {number}
   */
  getCounter() {
    if (this.path.length === 0) return -1;
    return this.path[this.path.length - 1].counter ?? 0;
  }

  /**
   * Get current node's sibling index (alias for getPosition).
   * @returns {number}
   * @deprecated Use getPosition() or getCounter() instead
   */
  getIndex() {
    return this.getPosition();
  }

  /**
   * Get current path depth.
   * @returns {number}
   */
  getDepth() {
    return this.path.length;
  }

  /**
   * Get path as string.
   * @param {string} [separator] - Optional separator (uses default if not provided)
   * @param {boolean} [includeNamespace=true]
   * @returns {string}
   */
  toString(separator, includeNamespace = true) {
    const sep = separator || this.separator;
    const isDefault = (sep === this.separator && includeNamespace === true);

    if (isDefault) {
      if (this._pathStringCache !== null) {
        return this._pathStringCache;
      }
      const result = this.path.map(n =>
        (n.namespace) ? `${n.namespace}:${n.tag}` : n.tag
      ).join(sep);
      this._pathStringCache = result;
      return result;
    }

    return this.path.map(n =>
      (includeNamespace && n.namespace) ? `${n.namespace}:${n.tag}` : n.tag
    ).join(sep);
  }

  /**
   * Get path as array of tag names.
   * @returns {string[]}
   */
  toArray() {
    return this.path.map(n => n.tag);
  }

  /**
   * Reset the path to empty.
   */
  reset() {
    this._pathStringCache = null;
    this.path = [];
    this.siblingStacks = [];
    this._keptAttrs = [];
  }

  /**
   * Match current path against an Expression.
   * @param {Expression} expression
   * @returns {boolean}
   */
  matches(expression) {
    const segments = expression.segments;

    if (segments.length === 0) {
      return false;
    }

    if (expression.hasDeepWildcard()) {
      return this._matchWithDeepWildcard(segments);
    }

    return this._matchSimple(segments);
  }

  /**
   * @private
   */
  _matchSimple(segments) {
    if (this.path.length !== segments.length) {
      return false;
    }

    for (let i = 0; i < segments.length; i++) {
      if (!this._matchSegment(segments[i], this.path[i], i === this.path.length - 1)) {
        return false;
      }
    }

    return true;
  }

  /**
   * @private
   */
  _matchWithDeepWildcard(segments) {
    let pathIdx = this.path.length - 1;
    let segIdx = segments.length - 1;

    while (segIdx >= 0 && pathIdx >= 0) {
      const segment = segments[segIdx];

      if (segment.type === 'deep-wildcard') {
        segIdx--;

        if (segIdx < 0) {
          return true;
        }

        const nextSeg = segments[segIdx];
        let found = false;

        for (let i = pathIdx; i >= 0; i--) {
          if (this._matchSegment(nextSeg, this.path[i], i === this.path.length - 1)) {
            pathIdx = i - 1;
            segIdx--;
            found = true;
            break;
          }
        }

        if (!found) {
          return false;
        }
      } else {
        if (!this._matchSegment(segment, this.path[pathIdx], pathIdx === this.path.length - 1)) {
          return false;
        }
        pathIdx--;
        segIdx--;
      }
    }

    return segIdx < 0;
  }

  /**
   * @private
   */
  _matchSegment(segment, node, isCurrentNode) {
    if (segment.tag !== '*' && segment.tag !== node.tag) {
      return false;
    }

    if (segment.namespace !== undefined) {
      if (segment.namespace !== '*' && segment.namespace !== node.namespace) {
        return false;
      }
    }

    if (segment.attrName !== undefined) {
      if (!isCurrentNode) {
        return false;
      }

      if (!node.values || !(segment.attrName in node.values)) {
        return false;
      }

      if (segment.attrValue !== undefined) {
        if (String(node.values[segment.attrName]) !== String(segment.attrValue)) {
          return false;
        }
      }
    }

    if (segment.position !== undefined) {
      if (!isCurrentNode) {
        return false;
      }

      const counter = node.counter ?? 0;

      if (segment.position === 'first' && counter !== 0) {
        return false;
      } else if (segment.position === 'odd' && counter % 2 !== 1) {
        return false;
      } else if (segment.position === 'even' && counter % 2 !== 0) {
        return false;
      } else if (segment.position === 'nth' && counter !== segment.positionValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match any expression in the given set against the current path.
   * @param {ExpressionSet} exprSet
   * @returns {boolean}
   */
  matchesAny(exprSet) {
    return exprSet.matchesAny(this);
  }

  /**
   * Create a snapshot of current state.
   * @returns {Object}
   */
  snapshot() {
    return {
      path: this.path.map(node => ({ ...node })),
      siblingStacks: this.siblingStacks.map(level => level ? { counts: new Map(level.counts), total: level.total } : level),
      keptAttrs: this._keptAttrs.map(entry => ({ ...entry }))
    };
  }

  /**
   * Restore state from snapshot.
   * @param {Object} snapshot
   */
  restore(snapshot) {
    this._pathStringCache = null;
    this.path = snapshot.path.map(node => ({ ...node }));
    this.siblingStacks = snapshot.siblingStacks.map(level => level ? { counts: new Map(level.counts), total: level.total } : level);
    this._keptAttrs = (snapshot.keptAttrs || []).map(entry => ({ ...entry }));
  }

  /**
   * Return the read-only {@link MatcherView} for this matcher.
   *
   * The same instance is returned on every call — no allocation occurs.
   * It always reflects the current parser state and is safe to pass to
   * user callbacks without risk of accidental mutation.
   *
   * @returns {MatcherView}
   *
   * @example
   * const view = matcher.readOnly();
   * // pass view to callbacks — it stays in sync automatically
   * view.matches(expr);       // ✓
   * view.getCurrentTag();     // ✓
   * // view.push(...)         // ✗ method does not exist — caught by TypeScript
   */
  readOnly() {
    return this._view;
  }
}

// const regx =
//   '<((!\\[CDATA\\[([\\s\\S]*?)(]]>))|((NAME:)?(NAME))([^>]*)>|((\\/)(NAME)\\s*>))([^<]*)'
//   .replace(/NAME/g, util.nameRegexp);

//const tagsRegx = new RegExp("<(\\/?[\\w:\\-\._]+)([^>]*)>(\\s*"+cdataRegx+")*([^<]+)?","g");
//const tagsRegx = new RegExp("<(\\/?)((\\w*:)?([\\w:\\-\._]+))([^>]*)>([^<]*)("+cdataRegx+"([^<]*))*([^<]+)?","g");

// Helper functions for attribute and namespace handling

/**
 * Extract raw attributes (without prefix) from prefixed attribute map
 * @param {object} prefixedAttrs - Attributes with prefix from buildAttributesMap
 * @param {object} options - Parser options containing attributeNamePrefix
 * @returns {object} Raw attributes for matcher
 */
function extractRawAttributes(prefixedAttrs, options) {
  if (!prefixedAttrs) return {};

  // Handle attributesGroupName option
  const attrs = options.attributesGroupName
    ? prefixedAttrs[options.attributesGroupName]
    : prefixedAttrs;

  if (!attrs) return {};

  const rawAttrs = {};
  for (const key in attrs) {
    // Remove the attribute prefix to get raw name
    if (key.startsWith(options.attributeNamePrefix)) {
      const rawName = key.substring(options.attributeNamePrefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      // Attribute without prefix (shouldn't normally happen, but be safe)
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}

/**
 * Extract namespace from raw tag name
 * @param {string} rawTagName - Tag name possibly with namespace (e.g., "soap:Envelope")
 * @returns {string|undefined} Namespace or undefined
 */
function extractNamespace(rawTagName) {
  if (!rawTagName || typeof rawTagName !== 'string') return undefined;

  const colonIndex = rawTagName.indexOf(':');
  if (colonIndex !== -1 && colonIndex > 0) {
    const ns = rawTagName.substring(0, colonIndex);
    // Don't treat xmlns as a namespace
    if (ns !== 'xmlns') {
      return ns;
    }
  }
  return undefined;
}

class OrderedObjParser {
  constructor(options) {
    this.options = options;
    this.currentNode = null;
    this.tagsNodeStack = [];
    this.docTypeEntities = {};
    this.lastEntities = {
      "apos": { regex: /&(apos|#39|#x27);/g, val: "'" },
      "gt": { regex: /&(gt|#62|#x3E);/g, val: ">" },
      "lt": { regex: /&(lt|#60|#x3C);/g, val: "<" },
      "quot": { regex: /&(quot|#34|#x22);/g, val: "\"" },
    };
    this.ampEntity = { regex: /&(amp|#38|#x26);/g, val: "&" };
    this.htmlEntities = {
      "space": { regex: /&(nbsp|#160);/g, val: " " },
      // "lt" : { regex: /&(lt|#60);/g, val: "<" },
      // "gt" : { regex: /&(gt|#62);/g, val: ">" },
      // "amp" : { regex: /&(amp|#38);/g, val: "&" },
      // "quot" : { regex: /&(quot|#34);/g, val: "\"" },
      // "apos" : { regex: /&(apos|#39);/g, val: "'" },
      "cent": { regex: /&(cent|#162);/g, val: "¢" },
      "pound": { regex: /&(pound|#163);/g, val: "£" },
      "yen": { regex: /&(yen|#165);/g, val: "¥" },
      "euro": { regex: /&(euro|#8364);/g, val: "€" },
      "copyright": { regex: /&(copy|#169);/g, val: "©" },
      "reg": { regex: /&(reg|#174);/g, val: "®" },
      "inr": { regex: /&(inr|#8377);/g, val: "₹" },
      "num_dec": { regex: /&#([0-9]{1,7});/g, val: (_, str) => fromCodePoint(str, 10, "&#") },
      "num_hex": { regex: /&#x([0-9a-fA-F]{1,6});/g, val: (_, str) => fromCodePoint(str, 16, "&#x") },
    };
    this.addExternalEntities = addExternalEntities;
    this.parseXml = parseXml;
    this.parseTextData = parseTextData;
    this.resolveNameSpace = resolveNameSpace;
    this.buildAttributesMap = buildAttributesMap;
    this.isItStopNode = isItStopNode;
    this.replaceEntitiesValue = replaceEntitiesValue;
    this.readStopNodeData = readStopNodeData;
    this.saveTextToParentTag = saveTextToParentTag;
    this.addChild = addChild;
    this.ignoreAttributesFn = getIgnoreAttributesFn(this.options.ignoreAttributes);
    this.entityExpansionCount = 0;
    this.currentExpandedLength = 0;

    // Initialize path matcher for path-expression-matcher
    this.matcher = new Matcher();

    // Flag to track if current node is a stop node (optimization)
    this.isCurrentNodeStopNode = false;

    // Pre-compile stopNodes expressions
    if (this.options.stopNodes && this.options.stopNodes.length > 0) {
      this.stopNodeExpressions = [];
      for (let i = 0; i < this.options.stopNodes.length; i++) {
        const stopNodeExp = this.options.stopNodes[i];
        if (typeof stopNodeExp === 'string') {
          // Convert string to Expression object
          this.stopNodeExpressions.push(new Expression(stopNodeExp));
        } else if (stopNodeExp instanceof Expression) {
          // Already an Expression object
          this.stopNodeExpressions.push(stopNodeExp);
        }
      }
    }
  }

}

function addExternalEntities(externalEntities) {
  const entKeys = Object.keys(externalEntities);
  for (let i = 0; i < entKeys.length; i++) {
    const ent = entKeys[i];
    const escaped = ent.replace(/[.\-+*:]/g, '\\.');
    this.lastEntities[ent] = {
      regex: new RegExp("&" + escaped + ";", "g"),
      val: externalEntities[ent]
    };
  }
}

/**
 * @param {string} val
 * @param {string} tagName
 * @param {string|Matcher} jPath - jPath string or Matcher instance based on options.jPath
 * @param {boolean} dontTrim
 * @param {boolean} hasAttributes
 * @param {boolean} isLeafNode
 * @param {boolean} escapeEntities
 */
function parseTextData(val, tagName, jPath, dontTrim, hasAttributes, isLeafNode, escapeEntities) {
  if (val !== undefined) {
    if (this.options.trimValues && !dontTrim) {
      val = val.trim();
    }
    if (val.length > 0) {
      if (!escapeEntities) val = this.replaceEntitiesValue(val, tagName, jPath);

      // Pass jPath string or matcher based on options.jPath setting
      const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
      const newval = this.options.tagValueProcessor(tagName, val, jPathOrMatcher, hasAttributes, isLeafNode);
      if (newval === null || newval === undefined) {
        //don't parse
        return val;
      } else if (typeof newval !== typeof val || newval !== val) {
        //overwrite
        return newval;
      } else if (this.options.trimValues) {
        return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
      } else {
        const trimmedVal = val.trim();
        if (trimmedVal === val) {
          return parseValue(val, this.options.parseTagValue, this.options.numberParseOptions);
        } else {
          return val;
        }
      }
    }
  }
}

function resolveNameSpace(tagname) {
  if (this.options.removeNSPrefix) {
    const tags = tagname.split(':');
    const prefix = tagname.charAt(0) === '/' ? '/' : '';
    if (tags[0] === 'xmlns') {
      return '';
    }
    if (tags.length === 2) {
      tagname = prefix + tags[1];
    }
  }
  return tagname;
}

//TODO: change regex to capture NS
//const attrsRegx = new RegExp("([\\w\\-\\.\\:]+)\\s*=\\s*(['\"])((.|\n)*?)\\2","gm");
const attrsRegx = new RegExp('([^\\s=]+)\\s*(=\\s*([\'"])([\\s\\S]*?)\\3)?', 'gm');

function buildAttributesMap(attrStr, jPath, tagName) {
  if (this.options.ignoreAttributes !== true && typeof attrStr === 'string') {
    // attrStr = attrStr.replace(/\r?\n/g, ' ');
    //attrStr = attrStr || attrStr.trim();

    const matches = getAllMatches(attrStr, attrsRegx);
    const len = matches.length; //don't make it inline
    const attrs = {};

    // First pass: parse all attributes and update matcher with raw values
    // This ensures the matcher has all attribute values when processors run
    const rawAttrsForMatcher = {};
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);
      const oldVal = matches[i][4];

      if (attrName.length && oldVal !== undefined) {
        let parsedVal = oldVal;
        if (this.options.trimValues) {
          parsedVal = parsedVal.trim();
        }
        parsedVal = this.replaceEntitiesValue(parsedVal, tagName, jPath);
        rawAttrsForMatcher[attrName] = parsedVal;
      }
    }

    // Update matcher with raw attribute values BEFORE running processors
    if (Object.keys(rawAttrsForMatcher).length > 0 && typeof jPath === 'object' && jPath.updateCurrent) {
      jPath.updateCurrent(rawAttrsForMatcher);
    }

    // Second pass: now process attributes with matcher having full attribute context
    for (let i = 0; i < len; i++) {
      const attrName = this.resolveNameSpace(matches[i][1]);

      // Convert jPath to string if needed for ignoreAttributesFn
      const jPathStr = this.options.jPath ? jPath.toString() : jPath;
      if (this.ignoreAttributesFn(attrName, jPathStr)) {
        continue
      }

      let oldVal = matches[i][4];
      let aName = this.options.attributeNamePrefix + attrName;

      if (attrName.length) {
        if (this.options.transformAttributeName) {
          aName = this.options.transformAttributeName(aName);
        }
        //if (aName === "__proto__") aName = "#__proto__";
        aName = sanitizeName(aName, this.options);

        if (oldVal !== undefined) {
          if (this.options.trimValues) {
            oldVal = oldVal.trim();
          }
          oldVal = this.replaceEntitiesValue(oldVal, tagName, jPath);

          // Pass jPath string or matcher based on options.jPath setting
          const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
          const newVal = this.options.attributeValueProcessor(attrName, oldVal, jPathOrMatcher);
          if (newVal === null || newVal === undefined) {
            //don't parse
            attrs[aName] = oldVal;
          } else if (typeof newVal !== typeof oldVal || newVal !== oldVal) {
            //overwrite
            attrs[aName] = newVal;
          } else {
            //parse
            attrs[aName] = parseValue(
              oldVal,
              this.options.parseAttributeValue,
              this.options.numberParseOptions
            );
          }
        } else if (this.options.allowBooleanAttributes) {
          attrs[aName] = true;
        }
      }
    }

    if (!Object.keys(attrs).length) {
      return;
    }
    if (this.options.attributesGroupName) {
      const attrCollection = {};
      attrCollection[this.options.attributesGroupName] = attrs;
      return attrCollection;
    }
    return attrs
  }
}

const parseXml = function (xmlData) {
  xmlData = xmlData.replace(/\r\n?/g, "\n"); //TODO: remove this line
  const xmlObj = new XmlNode('!xml');
  let currentNode = xmlObj;
  let textData = "";

  // Reset matcher for new document
  this.matcher.reset();

  // Reset entity expansion counters for this document
  this.entityExpansionCount = 0;
  this.currentExpandedLength = 0;

  const docTypeReader = new DocTypeReader(this.options.processEntities);
  for (let i = 0; i < xmlData.length; i++) {//for each char in XML data
    const ch = xmlData[i];
    if (ch === '<') {
      // const nextIndex = i+1;
      // const _2ndChar = xmlData[nextIndex];
      if (xmlData[i + 1] === '/') {//Closing Tag
        const closeIndex = findClosingIndex(xmlData, ">", i, "Closing Tag is not closed.");
        let tagName = xmlData.substring(i + 2, closeIndex).trim();

        if (this.options.removeNSPrefix) {
          const colonIndex = tagName.indexOf(":");
          if (colonIndex !== -1) {
            tagName = tagName.substr(colonIndex + 1);
          }
        }

        tagName = transformTagName(this.options.transformTagName, tagName, "", this.options).tagName;

        if (currentNode) {
          textData = this.saveTextToParentTag(textData, currentNode, this.matcher);
        }

        //check if last tag of nested tag was unpaired tag
        const lastTagName = this.matcher.getCurrentTag();
        if (tagName && this.options.unpairedTags.indexOf(tagName) !== -1) {
          throw new Error(`Unpaired tag can not be used as closing tag: </${tagName}>`);
        }
        if (lastTagName && this.options.unpairedTags.indexOf(lastTagName) !== -1) {
          // Pop the unpaired tag
          this.matcher.pop();
          this.tagsNodeStack.pop();
        }
        // Pop the closing tag
        this.matcher.pop();
        this.isCurrentNodeStopNode = false; // Reset flag when closing tag

        currentNode = this.tagsNodeStack.pop();//avoid recursion, set the parent tag scope
        textData = "";
        i = closeIndex;
      } else if (xmlData[i + 1] === '?') {

        let tagData = readTagExp(xmlData, i, false, "?>");
        if (!tagData) throw new Error("Pi Tag is not closed.");

        textData = this.saveTextToParentTag(textData, currentNode, this.matcher);
        if ((this.options.ignoreDeclaration && tagData.tagName === "?xml") || this.options.ignorePiTags) ; else {

          const childNode = new XmlNode(tagData.tagName);
          childNode.add(this.options.textNodeName, "");

          if (tagData.tagName !== tagData.tagExp && tagData.attrExpPresent) {
            childNode[":@"] = this.buildAttributesMap(tagData.tagExp, this.matcher, tagData.tagName);
          }
          this.addChild(currentNode, childNode, this.matcher, i);
        }


        i = tagData.closeIndex + 1;
      } else if (xmlData.substr(i + 1, 3) === '!--') {
        const endIndex = findClosingIndex(xmlData, "-->", i + 4, "Comment is not closed.");
        if (this.options.commentPropName) {
          const comment = xmlData.substring(i + 4, endIndex - 2);

          textData = this.saveTextToParentTag(textData, currentNode, this.matcher);

          currentNode.add(this.options.commentPropName, [{ [this.options.textNodeName]: comment }]);
        }
        i = endIndex;
      } else if (xmlData.substr(i + 1, 2) === '!D') {
        const result = docTypeReader.readDocType(xmlData, i);
        this.docTypeEntities = result.entities;
        i = result.i;
      } else if (xmlData.substr(i + 1, 2) === '![') {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "CDATA is not closed.") - 2;
        const tagExp = xmlData.substring(i + 9, closeIndex);

        textData = this.saveTextToParentTag(textData, currentNode, this.matcher);

        let val = this.parseTextData(tagExp, currentNode.tagname, this.matcher, true, false, true, true);
        if (val == undefined) val = "";

        //cdata should be set even if it is 0 length string
        if (this.options.cdataPropName) {
          currentNode.add(this.options.cdataPropName, [{ [this.options.textNodeName]: tagExp }]);
        } else {
          currentNode.add(this.options.textNodeName, val);
        }

        i = closeIndex + 2;
      } else {//Opening tag
        let result = readTagExp(xmlData, i, this.options.removeNSPrefix);

        // Safety check: readTagExp can return undefined
        if (!result) {
          // Log context for debugging
          const context = xmlData.substring(Math.max(0, i - 50), Math.min(xmlData.length, i + 50));
          throw new Error(`readTagExp returned undefined at position ${i}. Context: "${context}"`);
        }

        let tagName = result.tagName;
        const rawTagName = result.rawTagName;
        let tagExp = result.tagExp;
        let attrExpPresent = result.attrExpPresent;
        let closeIndex = result.closeIndex;

        ({ tagName, tagExp } = transformTagName(this.options.transformTagName, tagName, tagExp, this.options));

        if (this.options.strictReservedNames &&
          (tagName === this.options.commentPropName
            || tagName === this.options.cdataPropName
          )) {
          throw new Error(`Invalid tag name: ${tagName}`);
        }

        //save text as child node
        if (currentNode && textData) {
          if (currentNode.tagname !== '!xml') {
            //when nested tag is found
            textData = this.saveTextToParentTag(textData, currentNode, this.matcher, false);
          }
        }

        //check if last tag was unpaired tag
        const lastTag = currentNode;
        if (lastTag && this.options.unpairedTags.indexOf(lastTag.tagname) !== -1) {
          currentNode = this.tagsNodeStack.pop();
          this.matcher.pop();
        }

        // Clean up self-closing syntax BEFORE processing attributes
        // This is where tagExp gets the trailing / removed
        let isSelfClosing = false;
        if (tagExp.length > 0 && tagExp.lastIndexOf("/") === tagExp.length - 1) {
          isSelfClosing = true;
          if (tagName[tagName.length - 1] === "/") {
            tagName = tagName.substr(0, tagName.length - 1);
            tagExp = tagName;
          } else {
            tagExp = tagExp.substr(0, tagExp.length - 1);
          }

          // Re-check attrExpPresent after cleaning
          attrExpPresent = (tagName !== tagExp);
        }

        // Now process attributes with CLEAN tagExp (no trailing /)
        let prefixedAttrs = null;
        let namespace = undefined;

        // Extract namespace from rawTagName
        namespace = extractNamespace(rawTagName);

        // Push tag to matcher FIRST (with empty attrs for now) so callbacks see correct path
        if (tagName !== xmlObj.tagname) {
          this.matcher.push(tagName, {}, namespace);
        }

        // Now build attributes - callbacks will see correct matcher state
        if (tagName !== tagExp && attrExpPresent) {
          // Build attributes (returns prefixed attributes for the tree)
          // Note: buildAttributesMap now internally updates the matcher with raw attributes
          prefixedAttrs = this.buildAttributesMap(tagExp, this.matcher, tagName);

          if (prefixedAttrs) {
            // Extract raw attributes (without prefix) for our use
            extractRawAttributes(prefixedAttrs, this.options);
          }
        }

        // Now check if this is a stop node (after attributes are set)
        if (tagName !== xmlObj.tagname) {
          this.isCurrentNodeStopNode = this.isItStopNode(this.stopNodeExpressions, this.matcher);
        }

        const startIndex = i;
        if (this.isCurrentNodeStopNode) {
          let tagContent = "";

          // For self-closing tags, content is empty
          if (isSelfClosing) {
            i = result.closeIndex;
          }
          //unpaired tag
          else if (this.options.unpairedTags.indexOf(tagName) !== -1) {
            i = result.closeIndex;
          }
          //normal tag
          else {
            //read until closing tag is found
            const result = this.readStopNodeData(xmlData, rawTagName, closeIndex + 1);
            if (!result) throw new Error(`Unexpected end of ${rawTagName}`);
            i = result.i;
            tagContent = result.tagContent;
          }

          const childNode = new XmlNode(tagName);

          if (prefixedAttrs) {
            childNode[":@"] = prefixedAttrs;
          }

          // For stop nodes, store raw content as-is without any processing
          childNode.add(this.options.textNodeName, tagContent);

          this.matcher.pop(); // Pop the stop node tag
          this.isCurrentNodeStopNode = false; // Reset flag

          this.addChild(currentNode, childNode, this.matcher, startIndex);
        } else {
          //selfClosing tag
          if (isSelfClosing) {
            ({ tagName, tagExp } = transformTagName(this.options.transformTagName, tagName, tagExp, this.options));

            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.matcher, startIndex);
            this.matcher.pop(); // Pop self-closing tag
            this.isCurrentNodeStopNode = false; // Reset flag
          }
          else if (this.options.unpairedTags.indexOf(tagName) !== -1) {//unpaired tag
            const childNode = new XmlNode(tagName);
            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.matcher, startIndex);
            this.matcher.pop(); // Pop unpaired tag
            this.isCurrentNodeStopNode = false; // Reset flag
            i = result.closeIndex;
            // Continue to next iteration without changing currentNode
            continue;
          }
          //opening tag
          else {
            const childNode = new XmlNode(tagName);
            if (this.tagsNodeStack.length > this.options.maxNestedTags) {
              throw new Error("Maximum nested tags exceeded");
            }
            this.tagsNodeStack.push(currentNode);

            if (prefixedAttrs) {
              childNode[":@"] = prefixedAttrs;
            }
            this.addChild(currentNode, childNode, this.matcher, startIndex);
            currentNode = childNode;
          }
          textData = "";
          i = closeIndex;
        }
      }
    } else {
      textData += xmlData[i];
    }
  }
  return xmlObj.child;
};

function addChild(currentNode, childNode, matcher, startIndex) {
  // unset startIndex if not requested
  if (!this.options.captureMetaData) startIndex = undefined;

  // Pass jPath string or matcher based on options.jPath setting
  const jPathOrMatcher = this.options.jPath ? matcher.toString() : matcher;
  const result = this.options.updateTag(childNode.tagname, jPathOrMatcher, childNode[":@"]);
  if (result === false) ; else if (typeof result === "string") {
    childNode.tagname = result;
    currentNode.addChild(childNode, startIndex);
  } else {
    currentNode.addChild(childNode, startIndex);
  }
}

/**
 * @param {object} val - Entity object with regex and val properties
 * @param {string} tagName - Tag name
 * @param {string|Matcher} jPath - jPath string or Matcher instance based on options.jPath
 */
function replaceEntitiesValue(val, tagName, jPath) {
  const entityConfig = this.options.processEntities;

  if (!entityConfig || !entityConfig.enabled) {
    return val;
  }

  // Check if tag is allowed to contain entities
  if (entityConfig.allowedTags) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    const allowed = Array.isArray(entityConfig.allowedTags)
      ? entityConfig.allowedTags.includes(tagName)
      : entityConfig.allowedTags(tagName, jPathOrMatcher);

    if (!allowed) {
      return val;
    }
  }

  // Apply custom tag filter if provided
  if (entityConfig.tagFilter) {
    const jPathOrMatcher = this.options.jPath ? jPath.toString() : jPath;
    if (!entityConfig.tagFilter(tagName, jPathOrMatcher)) {
      return val; // Skip based on custom filter
    }
  }

  // Replace DOCTYPE entities
  for (const entityName of Object.keys(this.docTypeEntities)) {
    const entity = this.docTypeEntities[entityName];
    const matches = val.match(entity.regx);

    if (matches) {
      // Track expansions
      this.entityExpansionCount += matches.length;

      // Check expansion limit
      if (entityConfig.maxTotalExpansions &&
        this.entityExpansionCount > entityConfig.maxTotalExpansions) {
        throw new Error(
          `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
        );
      }

      // Store length before replacement
      const lengthBefore = val.length;
      val = val.replace(entity.regx, entity.val);

      // Check expanded length immediately after replacement
      if (entityConfig.maxExpandedLength) {
        this.currentExpandedLength += (val.length - lengthBefore);

        if (this.currentExpandedLength > entityConfig.maxExpandedLength) {
          throw new Error(
            `Total expanded content size exceeded: ${this.currentExpandedLength} > ${entityConfig.maxExpandedLength}`
          );
        }
      }
    }
  }
  // Replace standard entities
  for (const entityName of Object.keys(this.lastEntities)) {
    const entity = this.lastEntities[entityName];
    const matches = val.match(entity.regex);
    if (matches) {
      this.entityExpansionCount += matches.length;
      if (entityConfig.maxTotalExpansions &&
        this.entityExpansionCount > entityConfig.maxTotalExpansions) {
        throw new Error(
          `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
        );
      }
    }
    val = val.replace(entity.regex, entity.val);
  }
  if (val.indexOf('&') === -1) return val;

  // Replace HTML entities if enabled
  if (this.options.htmlEntities) {
    for (const entityName of Object.keys(this.htmlEntities)) {
      const entity = this.htmlEntities[entityName];
      const matches = val.match(entity.regex);
      if (matches) {
        //console.log(matches);
        this.entityExpansionCount += matches.length;
        if (entityConfig.maxTotalExpansions &&
          this.entityExpansionCount > entityConfig.maxTotalExpansions) {
          throw new Error(
            `Entity expansion limit exceeded: ${this.entityExpansionCount} > ${entityConfig.maxTotalExpansions}`
          );
        }
      }
      val = val.replace(entity.regex, entity.val);
    }
  }

  // Replace ampersand entity last
  val = val.replace(this.ampEntity.regex, this.ampEntity.val);

  return val;
}


function saveTextToParentTag(textData, parentNode, matcher, isLeafNode) {
  if (textData) { //store previously collected data as textNode
    if (isLeafNode === undefined) isLeafNode = parentNode.child.length === 0;

    textData = this.parseTextData(textData,
      parentNode.tagname,
      matcher,
      false,
      parentNode[":@"] ? Object.keys(parentNode[":@"]).length !== 0 : false,
      isLeafNode);

    if (textData !== undefined && textData !== "")
      parentNode.add(this.options.textNodeName, textData);
    textData = "";
  }
  return textData;
}

//TODO: use jPath to simplify the logic
/**
 * @param {Array<Expression>} stopNodeExpressions - Array of compiled Expression objects
 * @param {Matcher} matcher - Current path matcher
 */
function isItStopNode(stopNodeExpressions, matcher) {
  if (!stopNodeExpressions || stopNodeExpressions.length === 0) return false;

  for (let i = 0; i < stopNodeExpressions.length; i++) {
    if (matcher.matches(stopNodeExpressions[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Returns the tag Expression and where it is ending handling single-double quotes situation
 * @param {string} xmlData 
 * @param {number} i starting index
 * @returns 
 */
function tagExpWithClosingIndex(xmlData, i, closingChar = ">") {
  let attrBoundary;
  let tagExp = "";
  for (let index = i; index < xmlData.length; index++) {
    let ch = xmlData[index];
    if (attrBoundary) {
      if (ch === attrBoundary) attrBoundary = "";//reset
    } else if (ch === '"' || ch === "'") {
      attrBoundary = ch;
    } else if (ch === closingChar[0]) {
      if (closingChar[1]) {
        if (xmlData[index + 1] === closingChar[1]) {
          return {
            data: tagExp,
            index: index
          }
        }
      } else {
        return {
          data: tagExp,
          index: index
        }
      }
    } else if (ch === '\t') {
      ch = " ";
    }
    tagExp += ch;
  }
}

function findClosingIndex(xmlData, str, i, errMsg) {
  const closingIndex = xmlData.indexOf(str, i);
  if (closingIndex === -1) {
    throw new Error(errMsg)
  } else {
    return closingIndex + str.length - 1;
  }
}

function readTagExp(xmlData, i, removeNSPrefix, closingChar = ">") {
  const result = tagExpWithClosingIndex(xmlData, i + 1, closingChar);
  if (!result) return;
  let tagExp = result.data;
  const closeIndex = result.index;
  const separatorIndex = tagExp.search(/\s/);
  let tagName = tagExp;
  let attrExpPresent = true;
  if (separatorIndex !== -1) {//separate tag name and attributes expression
    tagName = tagExp.substring(0, separatorIndex);
    tagExp = tagExp.substring(separatorIndex + 1).trimStart();
  }

  const rawTagName = tagName;
  if (removeNSPrefix) {
    const colonIndex = tagName.indexOf(":");
    if (colonIndex !== -1) {
      tagName = tagName.substr(colonIndex + 1);
      attrExpPresent = tagName !== result.data.substr(colonIndex + 1);
    }
  }

  return {
    tagName: tagName,
    tagExp: tagExp,
    closeIndex: closeIndex,
    attrExpPresent: attrExpPresent,
    rawTagName: rawTagName,
  }
}
/**
 * find paired tag for a stop node
 * @param {string} xmlData 
 * @param {string} tagName 
 * @param {number} i 
 */
function readStopNodeData(xmlData, tagName, i) {
  const startIndex = i;
  // Starting at 1 since we already have an open tag
  let openTagCount = 1;

  for (; i < xmlData.length; i++) {
    if (xmlData[i] === "<") {
      if (xmlData[i + 1] === "/") {//close tag
        const closeIndex = findClosingIndex(xmlData, ">", i, `${tagName} is not closed`);
        let closeTagName = xmlData.substring(i + 2, closeIndex).trim();
        if (closeTagName === tagName) {
          openTagCount--;
          if (openTagCount === 0) {
            return {
              tagContent: xmlData.substring(startIndex, i),
              i: closeIndex
            }
          }
        }
        i = closeIndex;
      } else if (xmlData[i + 1] === '?') {
        const closeIndex = findClosingIndex(xmlData, "?>", i + 1, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 3) === '!--') {
        const closeIndex = findClosingIndex(xmlData, "-->", i + 3, "StopNode is not closed.");
        i = closeIndex;
      } else if (xmlData.substr(i + 1, 2) === '![') {
        const closeIndex = findClosingIndex(xmlData, "]]>", i, "StopNode is not closed.") - 2;
        i = closeIndex;
      } else {
        const tagData = readTagExp(xmlData, i, '>');

        if (tagData) {
          const openTagName = tagData && tagData.tagName;
          if (openTagName === tagName && tagData.tagExp[tagData.tagExp.length - 1] !== "/") {
            openTagCount++;
          }
          i = tagData.closeIndex;
        }
      }
    }
  }//end for loop
}

function parseValue(val, shouldParse, options) {
  if (shouldParse && typeof val === 'string') {
    //console.log(options)
    const newval = val.trim();
    if (newval === 'true') return true;
    else if (newval === 'false') return false;
    else return toNumber(val, options);
  } else {
    if (isExist(val)) {
      return val;
    } else {
      return '';
    }
  }
}

function fromCodePoint(str, base, prefix) {
  const codePoint = Number.parseInt(str, base);

  if (codePoint >= 0 && codePoint <= 0x10FFFF) {
    return String.fromCodePoint(codePoint);
  } else {
    return prefix + str + ";";
  }
}

function transformTagName(fn, tagName, tagExp, options) {
  if (fn) {
    const newTagName = fn(tagName);
    if (tagExp === tagName) {
      tagExp = newTagName;
    }
    tagName = newTagName;
  }
  tagName = sanitizeName(tagName, options);
  return { tagName, tagExp };
}



function sanitizeName(name, options) {
  if (criticalProperties.includes(name)) {
    throw new Error(`[SECURITY] Invalid name: "${name}" is a reserved JavaScript keyword that could cause prototype pollution`);
  } else if (DANGEROUS_PROPERTY_NAMES.includes(name)) {
    return options.onDangerousProperty(name);
  }
  return name;
}

const METADATA_SYMBOL = XmlNode.getMetaDataSymbol();

/**
 * Helper function to strip attribute prefix from attribute map
 * @param {object} attrs - Attributes with prefix (e.g., {"@_class": "code"})
 * @param {string} prefix - Attribute prefix to remove (e.g., "@_")
 * @returns {object} Attributes without prefix (e.g., {"class": "code"})
 */
function stripAttributePrefix(attrs, prefix) {
  if (!attrs || typeof attrs !== 'object') return {};
  if (!prefix) return attrs;

  const rawAttrs = {};
  for (const key in attrs) {
    if (key.startsWith(prefix)) {
      const rawName = key.substring(prefix.length);
      rawAttrs[rawName] = attrs[key];
    } else {
      // Attribute without prefix (shouldn't normally happen, but be safe)
      rawAttrs[key] = attrs[key];
    }
  }
  return rawAttrs;
}

/**
 * 
 * @param {array} node 
 * @param {any} options 
 * @param {Matcher} matcher - Path matcher instance
 * @returns 
 */
function prettify(node, options, matcher) {
  return compress(node, options, matcher);
}

/**
 * 
 * @param {array} arr 
 * @param {object} options 
 * @param {Matcher} matcher - Path matcher instance
 * @returns object
 */
function compress(arr, options, matcher) {
  let text;
  const compressedObj = {}; //This is intended to be a plain object
  for (let i = 0; i < arr.length; i++) {
    const tagObj = arr[i];
    const property = propName(tagObj);

    // Push current property to matcher WITH RAW ATTRIBUTES (no prefix)
    if (property !== undefined && property !== options.textNodeName) {
      const rawAttrs = stripAttributePrefix(
        tagObj[":@"] || {},
        options.attributeNamePrefix
      );
      matcher.push(property, rawAttrs);
    }

    if (property === options.textNodeName) {
      if (text === undefined) text = tagObj[property];
      else text += "" + tagObj[property];
    } else if (property === undefined) {
      continue;
    } else if (tagObj[property]) {

      let val = compress(tagObj[property], options, matcher);
      const isLeaf = isLeafTag(val, options);

      if (tagObj[":@"]) {
        assignAttributes(val, tagObj[":@"], matcher, options);
      } else if (Object.keys(val).length === 1 && val[options.textNodeName] !== undefined && !options.alwaysCreateTextNode) {
        val = val[options.textNodeName];
      } else if (Object.keys(val).length === 0) {
        if (options.alwaysCreateTextNode) val[options.textNodeName] = "";
        else val = "";
      }

      if (tagObj[METADATA_SYMBOL] !== undefined && typeof val === "object" && val !== null) {
        val[METADATA_SYMBOL] = tagObj[METADATA_SYMBOL]; // copy over metadata
      }


      if (compressedObj[property] !== undefined && Object.prototype.hasOwnProperty.call(compressedObj, property)) {
        if (!Array.isArray(compressedObj[property])) {
          compressedObj[property] = [compressedObj[property]];
        }
        compressedObj[property].push(val);
      } else {
        //TODO: if a node is not an array, then check if it should be an array
        //also determine if it is a leaf node

        // Pass jPath string or matcher based on options.jPath setting
        const jPathOrMatcher = options.jPath ? matcher.toString() : matcher;
        if (options.isArray(property, jPathOrMatcher, isLeaf)) {
          compressedObj[property] = [val];
        } else {
          compressedObj[property] = val;
        }
      }

      // Pop property from matcher after processing
      if (property !== undefined && property !== options.textNodeName) {
        matcher.pop();
      }
    }

  }
  // if(text && text.length > 0) compressedObj[options.textNodeName] = text;
  if (typeof text === "string") {
    if (text.length > 0) compressedObj[options.textNodeName] = text;
  } else if (text !== undefined) compressedObj[options.textNodeName] = text;


  return compressedObj;
}

function propName(obj) {
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== ":@") return key;
  }
}

function assignAttributes(obj, attrMap, matcher, options) {
  if (attrMap) {
    const keys = Object.keys(attrMap);
    const len = keys.length; //don't make it inline
    for (let i = 0; i < len; i++) {
      const atrrName = keys[i];  // This is the PREFIXED name (e.g., "@_class")

      // Strip prefix for matcher path (for isArray callback)
      const rawAttrName = atrrName.startsWith(options.attributeNamePrefix)
        ? atrrName.substring(options.attributeNamePrefix.length)
        : atrrName;

      // For attributes, we need to create a temporary path
      // Pass jPath string or matcher based on options.jPath setting
      const jPathOrMatcher = options.jPath
        ? matcher.toString() + "." + rawAttrName
        : matcher;

      if (options.isArray(atrrName, jPathOrMatcher, true, true)) {
        obj[atrrName] = [attrMap[atrrName]];
      } else {
        obj[atrrName] = attrMap[atrrName];
      }
    }
  }
}

function isLeafTag(obj, options) {
  const { textNodeName } = options;
  const propCount = Object.keys(obj).length;

  if (propCount === 0) {
    return true;
  }

  if (
    propCount === 1 &&
    (obj[textNodeName] || typeof obj[textNodeName] === "boolean" || obj[textNodeName] === 0)
  ) {
    return true;
  }

  return false;
}

class XMLParser {

    constructor(options) {
        this.externalEntities = {};
        this.options = buildOptions(options);

    }
    /**
     * Parse XML dats to JS object 
     * @param {string|Uint8Array} xmlData 
     * @param {boolean|Object} validationOption 
     */
    parse(xmlData, validationOption) {
        if (typeof xmlData !== "string" && xmlData.toString) {
            xmlData = xmlData.toString();
        } else if (typeof xmlData !== "string") {
            throw new Error("XML data is accepted in String or Bytes[] form.")
        }

        if (validationOption) {
            if (validationOption === true) validationOption = {}; //validate with default options

            const result = validate(xmlData, validationOption);
            if (result !== true) {
                throw Error(`${result.err.msg}:${result.err.line}:${result.err.col}`)
            }
        }
        const orderedObjParser = new OrderedObjParser(this.options);
        orderedObjParser.addExternalEntities(this.externalEntities);
        const orderedResult = orderedObjParser.parseXml(xmlData);
        if (this.options.preserveOrder || orderedResult === undefined) return orderedResult;
        else return prettify(orderedResult, this.options, orderedObjParser.matcher);
    }

    /**
     * Add Entity which is not by default supported by this library
     * @param {string} key 
     * @param {string} value 
     */
    addEntity(key, value) {
        if (value.indexOf("&") !== -1) {
            throw new Error("Entity value can't have '&'")
        } else if (key.indexOf("&") !== -1 || key.indexOf(";") !== -1) {
            throw new Error("An entity must be set without '&' and ';'. Eg. use '#xD' for '&#xD;'")
        } else if (value === "&") {
            throw new Error("An entity with value '&' is not permitted");
        } else {
            this.externalEntities[key] = value;
        }
    }

    /**
     * Returns a Symbol that can be used to access the metadata
     * property on a node.
     * 
     * If Symbol is not available in the environment, an ordinary property is used
     * and the name of the property is here returned.
     * 
     * The XMLMetaData property is only present when `captureMetaData`
     * is true in the options.
     */
    static getMetaDataSymbol() {
        return XmlNode.getMetaDataSymbol();
    }
}

const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true
});
function escapeXml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

const PRYZM_BCF_TRACER = "pryzm.bcf";
function getTracer() {
  return trace.getTracer(PRYZM_BCF_TRACER);
}
async function withSpan(name, attrs, fn) {
  const span = getTracer().startSpan(name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) span.setAttribute(k, v);
  }
  try {
    const out = await fn(span);
    span.setStatus({ code: SpanStatusCode.OK });
    return out;
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
    if (err instanceof Error) span.recordException(err);
    throw err;
  } finally {
    span.end();
  }
}

function n(v) {
  const out = Number(String(v ?? "0"));
  return Number.isFinite(out) ? out : 0;
}
function parseProject(files) {
  let version = "3.0";
  if (files["bcf.version"]) {
    const versionXml = PARSER.parse(strFromU8(files["bcf.version"]));
    if (versionXml.Version?.["@_VersionId"]) {
      version = String(versionXml.Version["@_VersionId"]);
    }
  }
  const projectFile = files["project.bcfp"];
  let projectId = "default";
  let name = "Untitled";
  let extensionSchema;
  if (projectFile) {
    const xml = PARSER.parse(strFromU8(projectFile));
    const ext = xml.ProjectExtension;
    const proj = ext?.Project ?? xml.Project;
    if (proj) {
      projectId = String(proj["@_ProjectId"] ?? projectId);
      name = String(proj.Name ?? name);
    }
    if (ext?.ExtensionSchema) extensionSchema = String(ext.ExtensionSchema);
  }
  return { projectId, name, version, extensionSchema };
}
function parseComponentNode(c) {
  if (!c || typeof c !== "object") return null;
  const cn = c;
  const ifcGuid = String(cn["@_IfcGuid"] ?? "");
  if (!ifcGuid) return null;
  const sys = cn.OriginatingSystem ? String(cn.OriginatingSystem) : void 0;
  const tool = cn.AuthoringToolId ? String(cn.AuthoringToolId) : void 0;
  return { ifcGuid, originatingSystem: sys, authoringToolId: tool };
}
function parseComponents(node) {
  if (!node) return void 0;
  const out = {};
  const hints = node.ViewSetupHints;
  if (hints) {
    const hint = {};
    if (hints["@_SpacesVisible"] != null) hint.spacesVisible = String(hints["@_SpacesVisible"]) === "true";
    if (hints["@_SpaceBoundariesVisible"] != null) hint.spaceBoundariesVisible = String(hints["@_SpaceBoundariesVisible"]) === "true";
    if (hints["@_OpeningsVisible"] != null) hint.openingsVisible = String(hints["@_OpeningsVisible"]) === "true";
    if (Object.keys(hint).length > 0) out.viewSetupHints = hint;
  }
  const sel = node.Selection;
  if (sel) {
    const comps = asArray(sel.Component).map(parseComponentNode).filter((c) => c != null);
    if (comps.length > 0) out.selection = comps;
  }
  const vis = node.Visibility;
  if (vis) {
    const defaultVisibility = String(vis["@_DefaultVisibility"] ?? "true") !== "false";
    const exc = vis.Exceptions;
    const exceptions = exc ? asArray(exc.Component).map(parseComponentNode).filter((c) => c != null) : [];
    out.visibility = { defaultVisibility, exceptions };
  }
  const col = node.Coloring;
  if (col) {
    const groups = asArray(col.Color).map((c) => {
      const cn = c;
      const color = String(cn["@_Color"] ?? "");
      const compsNode = cn.Components;
      const comps = compsNode ? asArray(compsNode.Component).map(parseComponentNode).filter((x) => x != null) : [];
      return { color, components: comps };
    }).filter((g) => g.color.length > 0);
    if (groups.length > 0) out.coloring = groups;
  }
  return Object.keys(out).length > 0 ? out : void 0;
}
function parseViewpoint(guid, bcfvBytes, snapshot) {
  if (!bcfvBytes) return null;
  const xml = PARSER.parse(strFromU8(bcfvBytes));
  const info = xml.VisualizationInfo;
  let position = null;
  if (info?.PerspectiveCamera) {
    const c = info.PerspectiveCamera;
    position = {
      cameraType: "perspective",
      cameraViewPoint: { x: n(c.CameraViewPoint?.X), y: n(c.CameraViewPoint?.Y), z: n(c.CameraViewPoint?.Z) },
      cameraDirection: { x: n(c.CameraDirection?.X), y: n(c.CameraDirection?.Y), z: n(c.CameraDirection?.Z) },
      cameraUpVector: { x: n(c.CameraUpVector?.X), y: n(c.CameraUpVector?.Y), z: n(c.CameraUpVector?.Z) },
      fieldOfView: n(c.FieldOfView)
    };
  } else if (info?.OrthogonalCamera) {
    const c = info.OrthogonalCamera;
    position = {
      cameraType: "orthogonal",
      cameraViewPoint: { x: n(c.CameraViewPoint?.X), y: n(c.CameraViewPoint?.Y), z: n(c.CameraViewPoint?.Z) },
      cameraDirection: { x: n(c.CameraDirection?.X), y: n(c.CameraDirection?.Y), z: n(c.CameraDirection?.Z) },
      cameraUpVector: { x: n(c.CameraUpVector?.X), y: n(c.CameraUpVector?.Y), z: n(c.CameraUpVector?.Z) },
      viewToWorldScale: n(c.ViewToWorldScale)
    };
  }
  const components = parseComponents(info?.Components);
  const out = { guid, position };
  if (snapshot) out.snapshotPng = snapshot;
  if (components) out.components = components;
  return out;
}
function parseTopic(topicGuid, files) {
  const markupBytes = files[`${topicGuid}/markup.bcf`];
  if (!markupBytes) return null;
  const xml = PARSER.parse(strFromU8(markupBytes));
  const m = xml.Markup;
  if (!m) return null;
  const topicNode = m.Topic;
  if (!topicNode) return null;
  const comments = asArray(m.Comment).map((c) => {
    const cn = c;
    return {
      guid: String(cn["@_Guid"] ?? ""),
      date: String(cn.Date ?? ""),
      author: String(cn.Author ?? ""),
      comment: String(cn.Comment ?? ""),
      viewpoint: cn.Viewpoint ? String(cn.Viewpoint["@_Guid"] ?? "") : void 0,
      parent: cn.ReplyToComment ? String(cn.ReplyToComment["@_Guid"] ?? "") : void 0
    };
  });
  const viewpointEntries = asArray(m.Viewpoints?.ViewPoint);
  const viewpoints = [];
  for (const entry of viewpointEntries) {
    const vpGuid = String(entry["@_Guid"] ?? "");
    if (!vpGuid) continue;
    const bcfvName = `${topicGuid}/${String(entry.Viewpoint ?? `viewpoint-${vpGuid}.bcfv`)}`;
    const snapName = entry.Snapshot ? `${topicGuid}/${String(entry.Snapshot)}` : null;
    const vp = parseViewpoint(vpGuid, files[bcfvName], snapName ? files[snapName] : void 0);
    if (vp) viewpoints.push(vp);
  }
  viewpoints.sort((a, b) => a.guid.localeCompare(b.guid));
  const relatedNode = topicNode.RelatedTopics;
  const relatedTopics = relatedNode ? asArray(relatedNode.RelatedTopic).map((r) => String(r["@_Guid"] ?? "")).filter((g) => g.length > 0).sort() : void 0;
  return {
    guid: String(topicNode["@_Guid"] ?? topicGuid),
    topicType: String(topicNode["@_TopicType"] ?? ""),
    topicStatus: String(topicNode["@_TopicStatus"] ?? ""),
    title: String(topicNode.Title ?? ""),
    priority: topicNode.Priority ? String(topicNode.Priority) : void 0,
    index: topicNode.Index != null ? Number(topicNode.Index) : void 0,
    labels: asArray(topicNode.Labels).map(String).filter((s) => s.length > 0),
    creationDate: String(topicNode.CreationDate ?? ""),
    creationAuthor: String(topicNode.CreationAuthor ?? ""),
    modifiedDate: topicNode.ModifiedDate ? String(topicNode.ModifiedDate) : void 0,
    modifiedAuthor: topicNode.ModifiedAuthor ? String(topicNode.ModifiedAuthor) : void 0,
    assignedTo: topicNode.AssignedTo ? String(topicNode.AssignedTo) : void 0,
    dueDate: topicNode.DueDate ? String(topicNode.DueDate) : void 0,
    stage: topicNode.Stage ? String(topicNode.Stage) : void 0,
    description: topicNode.Description ? String(topicNode.Description) : void 0,
    comments,
    viewpoints,
    relatedTopics: relatedTopics && relatedTopics.length > 0 ? relatedTopics : void 0
  };
}
async function readBCF(bytes) {
  return withSpan("pryzm.bcf.read", { byte_count: bytes.byteLength }, (span) => {
    const files = unzipSync(bytes);
    const project = parseProject(files);
    const topicGuids = /* @__PURE__ */ new Set();
    for (const path of Object.keys(files)) {
      const slash = path.indexOf("/");
      if (slash > 0) topicGuids.add(path.slice(0, slash));
    }
    const topics = [];
    for (const guid of [...topicGuids].sort()) {
      const t = parseTopic(guid, files);
      if (t) topics.push(t);
    }
    let viewpointTotal = 0;
    let componentTotal = 0;
    for (const t of topics) {
      viewpointTotal += t.viewpoints.length;
      for (const vp of t.viewpoints) {
        if (vp.components) {
          componentTotal += (vp.components.selection?.length ?? 0) + (vp.components.visibility?.exceptions.length ?? 0) + (vp.components.coloring ?? []).reduce((m, g) => m + g.components.length, 0);
        }
      }
    }
    span.setAttribute("topic_count", topics.length);
    span.setAttribute("viewpoint_count", viewpointTotal);
    span.setAttribute("component_count", componentTotal);
    return { project, topics };
  });
}

const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>\n';
const FIXED_MTIME = /* @__PURE__ */ new Date("1980-01-01T00:00:00Z");
function vpBcfvName(vpGuid) {
  return `viewpoint-${vpGuid}.bcfv`;
}
function vpSnapName(vpGuid) {
  return `snapshot-${vpGuid}.png`;
}
function projectXml(p) {
  const ext = p.extensionSchema ? `
  <ExtensionSchema>${escapeXml(p.extensionSchema)}</ExtensionSchema>` : "";
  return XML_DECL + `<ProjectExtension>
  <Project ProjectId="${escapeXml(p.projectId)}">
    <Name>${escapeXml(p.name)}</Name>
  </Project>${ext}
</ProjectExtension>
`;
}
function commentXml(c, indent) {
  const vp = c.viewpoint ? `${indent}  <Viewpoint Guid="${escapeXml(c.viewpoint)}" />
` : "";
  const parent = c.parent ? `${indent}  <ReplyToComment Guid="${escapeXml(c.parent)}" />
` : "";
  return `${indent}<Comment Guid="${escapeXml(c.guid)}">
${indent}  <Date>${escapeXml(c.date)}</Date>
${indent}  <Author>${escapeXml(c.author)}</Author>
${indent}  <Comment>${escapeXml(c.comment)}</Comment>
` + vp + parent + `${indent}</Comment>
`;
}
function viewpointEntryXml(vp, indent) {
  const hasSnap = !!vp.snapshotPng;
  const snap = hasSnap ? `${indent}  <Snapshot>${escapeXml(vpSnapName(vp.guid))}</Snapshot>
` : "";
  return `${indent}<ViewPoint Guid="${escapeXml(vp.guid)}">
${indent}  <Viewpoint>${escapeXml(vpBcfvName(vp.guid))}</Viewpoint>
` + snap + `${indent}</ViewPoint>
`;
}
function relatedTopicsXml(guids) {
  if (!guids || guids.length === 0) return "";
  const sorted = [...guids].sort();
  return `    <RelatedTopics>
` + sorted.map((g) => `      <RelatedTopic Guid="${escapeXml(g)}" />
`).join("") + `    </RelatedTopics>
`;
}
function markupXml(t) {
  const labels = (t.labels ?? []).map((l) => `    <Labels>${escapeXml(l)}</Labels>
`).join("");
  const desc = t.description ? `    <Description>${escapeXml(t.description)}</Description>
` : "";
  const idx = t.index != null ? `    <Index>${t.index}</Index>
` : "";
  const pri = t.priority ? `    <Priority>${escapeXml(t.priority)}</Priority>
` : "";
  const modDate = t.modifiedDate ? `    <ModifiedDate>${escapeXml(t.modifiedDate)}</ModifiedDate>
` : "";
  const modAuth = t.modifiedAuthor ? `    <ModifiedAuthor>${escapeXml(t.modifiedAuthor)}</ModifiedAuthor>
` : "";
  const assignedTo = t.assignedTo ? `    <AssignedTo>${escapeXml(t.assignedTo)}</AssignedTo>
` : "";
  const dueDate = t.dueDate ? `    <DueDate>${escapeXml(t.dueDate)}</DueDate>
` : "";
  const stage = t.stage ? `    <Stage>${escapeXml(t.stage)}</Stage>
` : "";
  const topicBlock = `  <Topic Guid="${escapeXml(t.guid)}" TopicType="${escapeXml(t.topicType)}" TopicStatus="${escapeXml(t.topicStatus)}">
    <Title>${escapeXml(t.title)}</Title>
` + idx + labels + pri + relatedTopicsXml(t.relatedTopics) + `    <CreationDate>${escapeXml(t.creationDate)}</CreationDate>
    <CreationAuthor>${escapeXml(t.creationAuthor)}</CreationAuthor>
` + modDate + modAuth + assignedTo + dueDate + stage + desc + `  </Topic>
`;
  const commentsBlock = t.comments.map((c) => commentXml(c, "  ")).join("");
  const sortedVps = [...t.viewpoints].sort((a, b) => a.guid.localeCompare(b.guid));
  const viewpointsBlock = sortedVps.length > 0 ? `  <Viewpoints>
${sortedVps.map((vp) => viewpointEntryXml(vp, "    ")).join("")}  </Viewpoints>
` : "";
  return XML_DECL + `<Markup>
` + topicBlock + commentsBlock + viewpointsBlock + `</Markup>
`;
}
function componentXml(c, indent) {
  const sys = c.originatingSystem ? `${indent}  <OriginatingSystem>${escapeXml(c.originatingSystem)}</OriginatingSystem>
` : "";
  const tool = c.authoringToolId ? `${indent}  <AuthoringToolId>${escapeXml(c.authoringToolId)}</AuthoringToolId>
` : "";
  if (sys || tool) {
    return `${indent}<Component IfcGuid="${escapeXml(c.ifcGuid)}">
${sys}${tool}${indent}</Component>
`;
  }
  return `${indent}<Component IfcGuid="${escapeXml(c.ifcGuid)}" />
`;
}
function sortComponents(arr) {
  return [...arr].sort((a, b) => a.ifcGuid.localeCompare(b.ifcGuid));
}
function componentsXml(c, indent) {
  if (!c) return "";
  const parts = [];
  if (c.viewSetupHints) {
    const h = c.viewSetupHints;
    const attrs = [];
    if (h.spacesVisible != null) attrs.push(`SpacesVisible="${h.spacesVisible}"`);
    if (h.spaceBoundariesVisible != null) attrs.push(`SpaceBoundariesVisible="${h.spaceBoundariesVisible}"`);
    if (h.openingsVisible != null) attrs.push(`OpeningsVisible="${h.openingsVisible}"`);
    if (attrs.length > 0) {
      parts.push(`${indent}  <ViewSetupHints ${attrs.sort().join(" ")} />
`);
    }
  }
  if (c.selection && c.selection.length > 0) {
    const sorted = sortComponents(c.selection);
    parts.push(`${indent}  <Selection>
`);
    for (const comp of sorted) parts.push(componentXml(comp, `${indent}    `));
    parts.push(`${indent}  </Selection>
`);
  }
  if (c.visibility) {
    parts.push(`${indent}  <Visibility DefaultVisibility="${c.visibility.defaultVisibility}">
`);
    if (c.visibility.exceptions.length > 0) {
      const sorted = sortComponents(c.visibility.exceptions);
      parts.push(`${indent}    <Exceptions>
`);
      for (const comp of sorted) parts.push(componentXml(comp, `${indent}      `));
      parts.push(`${indent}    </Exceptions>
`);
    }
    parts.push(`${indent}  </Visibility>
`);
  }
  if (c.coloring && c.coloring.length > 0) {
    const sortedGroups = [...c.coloring].sort((a, b) => a.color.localeCompare(b.color));
    parts.push(`${indent}  <Coloring>
`);
    for (const grp of sortedGroups) {
      parts.push(`${indent}    <Color Color="${escapeXml(grp.color)}">
`);
      parts.push(`${indent}      <Components>
`);
      const sortedComps = sortComponents(grp.components);
      for (const comp of sortedComps) parts.push(componentXml(comp, `${indent}        `));
      parts.push(`${indent}      </Components>
`);
      parts.push(`${indent}    </Color>
`);
    }
    parts.push(`${indent}  </Coloring>
`);
  }
  if (parts.length === 0) return "";
  return `${indent}<Components>
` + parts.join("") + `${indent}</Components>
`;
}
function viewpointBcfvXml(vp) {
  const p = vp.position;
  const cam = p ? p.cameraType === "perspective" ? perspectiveCameraXml(p) : orthogonalCameraXml(p) : "";
  const comps = componentsXml(vp.components, "  ");
  const inner = cam + comps;
  if (!inner) return XML_DECL + `<VisualizationInfo />
`;
  return XML_DECL + `<VisualizationInfo>
` + inner + `</VisualizationInfo>
`;
}
function vec3Xml(name, v, indent) {
  return `${indent}<${name}>
${indent}  <X>${v.x}</X>
${indent}  <Y>${v.y}</Y>
${indent}  <Z>${v.z}</Z>
${indent}</${name}>
`;
}
function perspectiveCameraXml(p) {
  return `  <PerspectiveCamera>
` + vec3Xml("CameraViewPoint", p.cameraViewPoint, "    ") + vec3Xml("CameraDirection", p.cameraDirection, "    ") + vec3Xml("CameraUpVector", p.cameraUpVector, "    ") + `    <FieldOfView>${p.fieldOfView ?? 60}</FieldOfView>
  </PerspectiveCamera>
`;
}
function orthogonalCameraXml(p) {
  return `  <OrthogonalCamera>
` + vec3Xml("CameraViewPoint", p.cameraViewPoint, "    ") + vec3Xml("CameraDirection", p.cameraDirection, "    ") + vec3Xml("CameraUpVector", p.cameraUpVector, "    ") + `    <ViewToWorldScale>${p.viewToWorldScale ?? 1}</ViewToWorldScale>
  </OrthogonalCamera>
`;
}
async function writeBCF(archive) {
  return withSpan("pryzm.bcf.write", { topic_count: archive.topics.length }, (span) => {
    const entries = {};
    const opt = { mtime: FIXED_MTIME };
    entries["bcf.version"] = [strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Version VersionId="${escapeXml(archive.project.version)}" />
`), opt];
    entries["project.bcfp"] = [strToU8(projectXml(archive.project)), opt];
    let viewpointTotal = 0;
    let componentTotal = 0;
    const topics = [...archive.topics].sort((a, b) => a.guid.localeCompare(b.guid));
    for (const t of topics) {
      entries[`${t.guid}/markup.bcf`] = [strToU8(markupXml(t)), opt];
      const sortedVps = [...t.viewpoints].sort((a, b) => a.guid.localeCompare(b.guid));
      for (const vp of sortedVps) {
        viewpointTotal += 1;
        entries[`${t.guid}/${vpBcfvName(vp.guid)}`] = [strToU8(viewpointBcfvXml(vp)), opt];
        if (vp.snapshotPng) {
          entries[`${t.guid}/${vpSnapName(vp.guid)}`] = [vp.snapshotPng, opt];
        }
        if (vp.components) {
          componentTotal += (vp.components.selection?.length ?? 0) + (vp.components.visibility?.exceptions.length ?? 0) + (vp.components.coloring ?? []).reduce((n, g) => n + g.components.length, 0);
        }
      }
    }
    span.setAttribute("viewpoint_count", viewpointTotal);
    span.setAttribute("component_count", componentTotal);
    const payload = {};
    for (const k of Object.keys(entries).sort()) {
      const v = entries[k];
      if (v !== void 0) payload[k] = v;
    }
    const bytes = zipSync(payload, { mtime: FIXED_MTIME });
    span.setAttribute("byte_count", bytes.byteLength);
    return bytes;
  });
}

function resolveComponent(c, resolver) {
  return {
    ifcGuid: c.ifcGuid,
    pryzmElementId: resolver.byGlobalId(c.ifcGuid),
    originatingSystem: c.originatingSystem,
    authoringToolId: c.authoringToolId
  };
}
function resolveViewpoint(vp, resolver) {
  const c = vp.components;
  const selection = (c?.selection ?? []).map((x) => resolveComponent(x, resolver));
  const exceptions = (c?.visibility?.exceptions ?? []).map((x) => resolveComponent(x, resolver));
  const defaultVisibility = c?.visibility?.defaultVisibility ?? true;
  const hidden = defaultVisibility ? exceptions : [];
  const coloring = (c?.coloring ?? []).map((g) => ({
    color: g.color,
    components: g.components.map((x) => resolveComponent(x, resolver))
  }));
  return { guid: vp.guid, selection, hidden, defaultVisibility, coloring };
}
function summariseResolution(archive, resolver) {
  let total = 0;
  let resolved = 0;
  const missing = /* @__PURE__ */ new Set();
  for (const topic of archive.topics) {
    for (const vp of topic.viewpoints) {
      const resolvedVp = resolveViewpoint(vp, resolver);
      const all = [
        ...resolvedVp.selection,
        ...resolvedVp.hidden,
        ...resolvedVp.coloring.flatMap((g) => g.components)
      ];
      for (const r of all) {
        total += 1;
        if (r.pryzmElementId != null) resolved += 1;
        else missing.add(r.ifcGuid);
      }
    }
  }
  return {
    componentsTotal: total,
    componentsResolved: resolved,
    componentsUnresolved: [...missing].sort()
  };
}
function selectionToBCFComponents(selectedPryzmIds, resolver) {
  const selection = [];
  const skipped = [];
  for (const id of selectedPryzmIds) {
    const guid = resolver.byPryzmId(id);
    if (guid) selection.push({ ifcGuid: guid });
    else skipped.push(id);
  }
  return {
    components: selection.length > 0 ? { selection } : {},
    skipped
  };
}
function buildResolversFromMap(map) {
  const inverse = /* @__PURE__ */ new Map();
  for (const [pryzmId, guid] of map) inverse.set(guid, pryzmId);
  return {
    byGlobalId: { byGlobalId: (g) => inverse.get(g) ?? null },
    byPryzmId: { byPryzmId: (p) => map.get(p) ?? null }
  };
}
function collectReferencedGlobalIds(archive) {
  const set = /* @__PURE__ */ new Set();
  for (const t of archive.topics) {
    for (const vp of t.viewpoints) {
      for (const c of vp.components?.selection ?? []) set.add(c.ifcGuid);
      for (const c of vp.components?.visibility?.exceptions ?? []) set.add(c.ifcGuid);
      for (const g of vp.components?.coloring ?? []) {
        for (const c of g.components) set.add(c.ifcGuid);
      }
    }
  }
  return [...set].sort();
}
function topicsWithComponentRefs(archive) {
  return archive.topics.filter(
    (t) => t.viewpoints.some(
      (vp) => (vp.components?.selection?.length ?? 0) > 0 || (vp.components?.visibility?.exceptions.length ?? 0) > 0 || (vp.components?.coloring?.length ?? 0) > 0
    )
  );
}

const DEFAULT_TARGET_DISTANCE_M = 10;
const DEG_TO_RAD = Math.PI / 180;
function viewpointToCameraTarget(viewpoint, opts = {}) {
  const position = viewpoint.position;
  if (!position) return null;
  return positionToCameraTarget(position, opts);
}
function positionToCameraTarget(position, opts = {}) {
  const distance = opts.targetDistance ?? DEFAULT_TARGET_DISTANCE_M;
  if (!isFinite(distance) || distance <= 0) {
    throw new Error(`viewpoint-navigator: targetDistance must be a positive number, got ${distance}`);
  }
  const direction = normalise(position.cameraDirection);
  const up = orthogonalUp(direction, position.cameraUpVector);
  const target = add(position.cameraViewPoint, scale(direction, distance));
  if (position.cameraType === "perspective") {
    const fovDeg = position.fieldOfView ?? 60;
    return {
      kind: "perspective",
      position: vec3(position.cameraViewPoint),
      direction,
      up,
      target,
      fovRad: fovDeg * DEG_TO_RAD,
      fovDeg,
      targetDistance: distance
    };
  }
  return {
    kind: "orthogonal",
    position: vec3(position.cameraViewPoint),
    direction,
    up,
    target,
    viewToWorldScale: position.viewToWorldScale ?? 1,
    targetDistance: distance
  };
}
function selectViewpointByGuid(viewpoints, guid) {
  return viewpoints.find((vp) => vp.guid === guid) ?? null;
}
function focusPointAtDistance(position, distance) {
  if (!isFinite(distance) || distance <= 0) {
    throw new Error(`viewpoint-navigator: distance must be a positive number, got ${distance}`);
  }
  return add(position.cameraViewPoint, scale(normalise(position.cameraDirection), distance));
}
function vec3(v) {
  return { x: v.x, y: v.y, z: v.z };
}
function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function length(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function normalise(v) {
  const len = length(v);
  if (len === 0) {
    throw new Error("viewpoint-navigator: cannot normalise a zero-length vector");
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function orthogonalUp(direction, upHint) {
  const upLen = length(upHint);
  const fallback = Math.abs(direction.z) > 0.99 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const seed = upLen === 0 ? fallback : upHint;
  const projected = sub(seed, scale(direction, dot(seed, direction)));
  const projectedLen = length(projected);
  if (projectedLen === 0) {
    const projectedFallback = sub(fallback, scale(direction, dot(fallback, direction)));
    return normalise(projectedFallback);
  }
  return { x: projected.x / projectedLen, y: projected.y / projectedLen, z: projected.z / projectedLen };
}

const PRIORITY_ISSUES = 80;
function createBcfPanelContribution(deps) {
  return {
    id: "bcf-issues",
    category: "Issues",
    priority: PRIORITY_ISSUES,
    shouldShow(context) {
      if (!deps.archive) return false;
      const guid = deps.resolveIfcGuid(context.elementId);
      if (!guid) return false;
      return deps.archive.topics.some((t) => topicReferencesGuid(t, guid));
    },
    render(container, context) {
      const archive = deps.archive;
      if (!archive) return;
      const guid = deps.resolveIfcGuid(context.elementId);
      if (!guid) return;
      const doc = container.ownerDocument;
      const topics = archive.topics.filter((t) => topicReferencesGuid(t, guid));
      const fieldset = doc.createElement("fieldset");
      fieldset.className = "bcf-issues-fieldset";
      const legend = doc.createElement("legend");
      legend.textContent = `BCF Issues (${topics.length})`;
      fieldset.appendChild(legend);
      for (const topic of topics) {
        fieldset.appendChild(renderTopic(doc, topic, deps));
      }
      container.appendChild(fieldset);
    },
    unmount(container) {
      container.replaceChildren();
    }
  };
}
function topicReferencesGuid(topic, ifcGuid) {
  for (const vp of topic.viewpoints) {
    const c = vp.components;
    if (!c) continue;
    if (c.selection?.some((s) => s.ifcGuid === ifcGuid)) return true;
    if (c.visibility?.exceptions.some((s) => s.ifcGuid === ifcGuid)) return true;
    if (c.coloring?.some((g) => g.components.some((s) => s.ifcGuid === ifcGuid))) return true;
  }
  return false;
}
function renderTopic(doc, topic, deps) {
  const details = doc.createElement("details");
  details.className = "bcf-topic";
  details.dataset.topicGuid = topic.guid;
  const summary = doc.createElement("summary");
  summary.className = "bcf-topic-summary";
  summary.textContent = `${topic.title} — ${topic.topicStatus}`;
  details.appendChild(summary);
  if (topic.description) {
    const desc = doc.createElement("p");
    desc.className = "bcf-topic-description";
    desc.textContent = topic.description;
    details.appendChild(desc);
  }
  if (topic.assignedTo || topic.dueDate || topic.stage) {
    const meta = doc.createElement("p");
    meta.className = "bcf-topic-meta";
    const parts = [];
    if (topic.assignedTo) parts.push(`Assigned to: ${topic.assignedTo}`);
    if (topic.dueDate) parts.push(`Due: ${topic.dueDate}`);
    if (topic.stage) parts.push(`Stage: ${topic.stage}`);
    meta.textContent = parts.join(" · ");
    details.appendChild(meta);
  }
  if (topic.viewpoints.length > 0) {
    const vpStrip = doc.createElement("div");
    vpStrip.className = "bcf-vp-strip";
    for (const vp of topic.viewpoints) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "vp-jumper";
      button.dataset.viewpointGuid = vp.guid;
      button.textContent = vp.position ? `Go to ${vp.position.cameraType} viewpoint` : "Snapshot only";
      const positionAvailable = vp.position !== null;
      if (!positionAvailable) {
        button.disabled = true;
      } else {
        button.addEventListener("click", () => {
          const target = viewpointToCameraTarget(vp, {
            ...deps.targetDistanceM !== void 0 ? { targetDistance: deps.targetDistanceM } : {}
          });
          if (target) deps.onNavigate(target, vp, topic);
        });
      }
      vpStrip.appendChild(button);
    }
    details.appendChild(vpStrip);
  }
  return details;
}

const BCF_COMMANDS = {
  /** Import a BCF 2.x/3.0 archive from a Uint8Array. */
  IMPORT: "bcf.import",
  /** Export the current BCF archive to bytes. */
  EXPORT: "bcf.export",
  /** Navigate the camera to a BCF viewpoint. */
  VIEWPOINT_NAVIGATE: "bcf.viewpoint.navigate",
  /** Open a BCF topic for editing. */
  TOPIC_OPEN: "bcf.topic.open",
  /** Create a new BCF topic. */
  TOPIC_CREATE: "bcf.topic.create",
  /** Update an existing BCF topic field. */
  TOPIC_UPDATE: "bcf.topic.update"
};

[
  BCF_COMMANDS.IMPORT,
  BCF_COMMANDS.EXPORT,
  BCF_COMMANDS.VIEWPOINT_NAVIGATE
];
function registerBCFHandlers(bus, deps = {}) {
  bus.on(BCF_COMMANDS.IMPORT, async (raw) => {
    const payload = raw;
    const archive = await readBCF(payload.bytes);
    deps.onImport?.(archive);
    return archive;
  });
  bus.on(BCF_COMMANDS.EXPORT, async (raw) => {
    const archive = deps.getArchive?.() ?? null;
    if (!archive) throw new Error("[BCF] No archive loaded — cannot export.");
    const bytes = await writeBCF(archive);
    return bytes;
  });
  bus.on(BCF_COMMANDS.VIEWPOINT_NAVIGATE, async (raw) => {
    const payload = raw;
    const archive = deps.getArchive?.() ?? null;
    if (!archive) return;
    const topic = archive.topics.find((t) => t.guid === payload.topicGuid);
    const vp = topic?.viewpoints?.find((v) => v.guid === payload.viewpointGuid);
    if (vp) {
      const target = viewpointToCameraTarget(vp);
      deps.onNavigate?.(target);
    }
  });
}

export { BCF_COMMANDS, PRYZM_BCF_TRACER, buildResolversFromMap, collectReferencedGlobalIds, createBcfPanelContribution, focusPointAtDistance, positionToCameraTarget, readBCF, registerBCFHandlers, resolveViewpoint, selectViewpointByGuid, selectionToBCFComponents, summariseResolution, topicsWithComponentRefs, viewpointToCameraTarget, writeBCF };
