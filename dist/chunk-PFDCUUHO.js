import { createRequire } from 'module';const require = createRequire(import.meta.url);
import {
  chatWithTools
} from "./chunk-QFTU6NVI.js";

// src/tools/codebase.ts
import { readFileSync as readFileSync2, existsSync as existsSync2, statSync } from "fs";
import { resolve } from "path";

// node_modules/balanced-match/dist/esm/index.js
var balanced = (a, b, str) => {
  const ma = a instanceof RegExp ? maybeMatch(a, str) : a;
  const mb = b instanceof RegExp ? maybeMatch(b, str) : b;
  const r = ma !== null && mb != null && range(ma, mb, str);
  return r && {
    start: r[0],
    end: r[1],
    pre: str.slice(0, r[0]),
    body: str.slice(r[0] + ma.length, r[1]),
    post: str.slice(r[1] + mb.length)
  };
};
var maybeMatch = (reg, str) => {
  const m = str.match(reg);
  return m ? m[0] : null;
};
var range = (a, b, str) => {
  let begs, beg, left, right = void 0, result;
  let ai = str.indexOf(a);
  let bi = str.indexOf(b, ai + 1);
  let i = ai;
  if (ai >= 0 && bi > 0) {
    if (a === b) {
      return [ai, bi];
    }
    begs = [];
    left = str.length;
    while (i >= 0 && !result) {
      if (i === ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length === 1) {
        const r = begs.pop();
        if (r !== void 0)
          result = [r, bi];
      } else {
        beg = begs.pop();
        if (beg !== void 0 && beg < left) {
          left = beg;
          right = bi;
        }
        bi = str.indexOf(b, i + 1);
      }
      i = ai < bi && ai >= 0 ? ai : bi;
    }
    if (begs.length && right !== void 0) {
      result = [left, right];
    }
  }
  return result;
};

// node_modules/brace-expansion/dist/esm/index.js
var escSlash = "\0SLASH" + Math.random() + "\0";
var escOpen = "\0OPEN" + Math.random() + "\0";
var escClose = "\0CLOSE" + Math.random() + "\0";
var escComma = "\0COMMA" + Math.random() + "\0";
var escPeriod = "\0PERIOD" + Math.random() + "\0";
var escSlashPattern = new RegExp(escSlash, "g");
var escOpenPattern = new RegExp(escOpen, "g");
var escClosePattern = new RegExp(escClose, "g");
var escCommaPattern = new RegExp(escComma, "g");
var escPeriodPattern = new RegExp(escPeriod, "g");
var slashPattern = /\\\\/g;
var openPattern = /\\{/g;
var closePattern = /\\}/g;
var commaPattern = /\\,/g;
var periodPattern = /\\\./g;
var EXPANSION_MAX = 1e5;
function numeric(str) {
  return !isNaN(str) ? parseInt(str, 10) : str.charCodeAt(0);
}
function escapeBraces(str) {
  return str.replace(slashPattern, escSlash).replace(openPattern, escOpen).replace(closePattern, escClose).replace(commaPattern, escComma).replace(periodPattern, escPeriod);
}
function unescapeBraces(str) {
  return str.replace(escSlashPattern, "\\").replace(escOpenPattern, "{").replace(escClosePattern, "}").replace(escCommaPattern, ",").replace(escPeriodPattern, ".");
}
function parseCommaParts(str) {
  if (!str) {
    return [""];
  }
  const parts = [];
  const m = balanced("{", "}", str);
  if (!m) {
    return str.split(",");
  }
  const { pre, body, post } = m;
  const p = pre.split(",");
  p[p.length - 1] += "{" + body + "}";
  const postParts = parseCommaParts(post);
  if (post.length) {
    ;
    p[p.length - 1] += postParts.shift();
    p.push.apply(p, postParts);
  }
  parts.push.apply(parts, p);
  return parts;
}
function expand(str, options = {}) {
  if (!str) {
    return [];
  }
  const { max = EXPANSION_MAX } = options;
  if (str.slice(0, 2) === "{}") {
    str = "\\{\\}" + str.slice(2);
  }
  return expand_(escapeBraces(str), max, true).map(unescapeBraces);
}
function embrace(str) {
  return "{" + str + "}";
}
function isPadded(el) {
  return /^-?0\d/.test(el);
}
function lte(i, y2) {
  return i <= y2;
}
function gte(i, y2) {
  return i >= y2;
}
function expand_(str, max, isTop) {
  const expansions = [];
  const m = balanced("{", "}", str);
  if (!m)
    return [str];
  const pre = m.pre;
  const post = m.post.length ? expand_(m.post, max, false) : [""];
  if (/\$$/.test(m.pre)) {
    for (let k = 0; k < post.length && k < max; k++) {
      const expansion = pre + "{" + m.body + "}" + post[k];
      expansions.push(expansion);
    }
  } else {
    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    const isSequence = isNumericSequence || isAlphaSequence;
    const isOptions = m.body.indexOf(",") >= 0;
    if (!isSequence && !isOptions) {
      if (m.post.match(/,(?!,).*\}/)) {
        str = m.pre + "{" + m.body + escClose + m.post;
        return expand_(str, max, true);
      }
      return [str];
    }
    let n;
    if (isSequence) {
      n = m.body.split(/\.\./);
    } else {
      n = parseCommaParts(m.body);
      if (n.length === 1 && n[0] !== void 0) {
        n = expand_(n[0], max, false).map(embrace);
        if (n.length === 1) {
          return post.map((p) => m.pre + n[0] + p);
        }
      }
    }
    let N;
    if (isSequence && n[0] !== void 0 && n[1] !== void 0) {
      const x2 = numeric(n[0]);
      const y2 = numeric(n[1]);
      const width = Math.max(n[0].length, n[1].length);
      let incr = n.length === 3 && n[2] !== void 0 ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
      let test = lte;
      const reverse = y2 < x2;
      if (reverse) {
        incr *= -1;
        test = gte;
      }
      const pad = n.some(isPadded);
      N = [];
      for (let i = x2; test(i, y2) && N.length < max; i += incr) {
        let c3;
        if (isAlphaSequence) {
          c3 = String.fromCharCode(i);
          if (c3 === "\\") {
            c3 = "";
          }
        } else {
          c3 = String(i);
          if (pad) {
            const need = width - c3.length;
            if (need > 0) {
              const z2 = new Array(need + 1).join("0");
              if (i < 0) {
                c3 = "-" + z2 + c3.slice(1);
              } else {
                c3 = z2 + c3;
              }
            }
          }
        }
        N.push(c3);
      }
    } else {
      N = [];
      for (let j = 0; j < n.length; j++) {
        N.push.apply(N, expand_(n[j], max, false));
      }
    }
    for (let j = 0; j < N.length; j++) {
      for (let k = 0; k < post.length && expansions.length < max; k++) {
        const expansion = pre + N[j] + post[k];
        if (!isTop || isSequence || expansion) {
          expansions.push(expansion);
        }
      }
    }
  }
  return expansions;
}

// node_modules/minimatch/dist/esm/assert-valid-pattern.js
var MAX_PATTERN_LENGTH = 1024 * 64;
var assertValidPattern = (pattern) => {
  if (typeof pattern !== "string") {
    throw new TypeError("invalid pattern");
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new TypeError("pattern is too long");
  }
};

// node_modules/minimatch/dist/esm/brace-expressions.js
var posixClasses = {
  "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true],
  "[:alpha:]": ["\\p{L}\\p{Nl}", true],
  "[:ascii:]": ["\\x00-\\x7f", false],
  "[:blank:]": ["\\p{Zs}\\t", true],
  "[:cntrl:]": ["\\p{Cc}", true],
  "[:digit:]": ["\\p{Nd}", true],
  "[:graph:]": ["\\p{Z}\\p{C}", true, true],
  "[:lower:]": ["\\p{Ll}", true],
  "[:print:]": ["\\p{C}", true],
  "[:punct:]": ["\\p{P}", true],
  "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true],
  "[:upper:]": ["\\p{Lu}", true],
  "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true],
  "[:xdigit:]": ["A-Fa-f0-9", false]
};
var braceEscape = (s) => s.replace(/[[\]\\-]/g, "\\$&");
var regexpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var rangesToString = (ranges) => ranges.join("");
var parseClass = (glob2, position) => {
  const pos = position;
  if (glob2.charAt(pos) !== "[") {
    throw new Error("not in a brace expression");
  }
  const ranges = [];
  const negs = [];
  let i = pos + 1;
  let sawStart = false;
  let uflag = false;
  let escaping = false;
  let negate = false;
  let endPos = pos;
  let rangeStart = "";
  WHILE: while (i < glob2.length) {
    const c3 = glob2.charAt(i);
    if ((c3 === "!" || c3 === "^") && i === pos + 1) {
      negate = true;
      i++;
      continue;
    }
    if (c3 === "]" && sawStart && !escaping) {
      endPos = i + 1;
      break;
    }
    sawStart = true;
    if (c3 === "\\") {
      if (!escaping) {
        escaping = true;
        i++;
        continue;
      }
    }
    if (c3 === "[" && !escaping) {
      for (const [cls, [unip, u, neg]] of Object.entries(posixClasses)) {
        if (glob2.startsWith(cls, i)) {
          if (rangeStart) {
            return ["$.", false, glob2.length - pos, true];
          }
          i += cls.length;
          if (neg)
            negs.push(unip);
          else
            ranges.push(unip);
          uflag = uflag || u;
          continue WHILE;
        }
      }
    }
    escaping = false;
    if (rangeStart) {
      if (c3 > rangeStart) {
        ranges.push(braceEscape(rangeStart) + "-" + braceEscape(c3));
      } else if (c3 === rangeStart) {
        ranges.push(braceEscape(c3));
      }
      rangeStart = "";
      i++;
      continue;
    }
    if (glob2.startsWith("-]", i + 1)) {
      ranges.push(braceEscape(c3 + "-"));
      i += 2;
      continue;
    }
    if (glob2.startsWith("-", i + 1)) {
      rangeStart = c3;
      i += 2;
      continue;
    }
    ranges.push(braceEscape(c3));
    i++;
  }
  if (endPos < i) {
    return ["", false, 0, false];
  }
  if (!ranges.length && !negs.length) {
    return ["$.", false, glob2.length - pos, true];
  }
  if (negs.length === 0 && ranges.length === 1 && /^\\?.$/.test(ranges[0]) && !negate) {
    const r = ranges[0].length === 2 ? ranges[0].slice(-1) : ranges[0];
    return [regexpEscape(r), false, endPos - pos, false];
  }
  const sranges = "[" + (negate ? "^" : "") + rangesToString(ranges) + "]";
  const snegs = "[" + (negate ? "" : "^") + rangesToString(negs) + "]";
  const comb = ranges.length && negs.length ? "(" + sranges + "|" + snegs + ")" : ranges.length ? sranges : snegs;
  return [comb, uflag, endPos - pos, true];
};

// node_modules/minimatch/dist/esm/unescape.js
var unescape = (s, { windowsPathsNoEscape = false, magicalBraces = true } = {}) => {
  if (magicalBraces) {
    return windowsPathsNoEscape ? s.replace(/\[([^/\\])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\])\]/g, "$1$2").replace(/\\([^/])/g, "$1");
  }
  return windowsPathsNoEscape ? s.replace(/\[([^/\\{}])\]/g, "$1") : s.replace(/((?!\\).|^)\[([^/\\{}])\]/g, "$1$2").replace(/\\([^/{}])/g, "$1");
};

// node_modules/minimatch/dist/esm/ast.js
var _a;
var types = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]);
var isExtglobType = (c3) => types.has(c3);
var isExtglobAST = (c3) => isExtglobType(c3.type);
var adoptionMap = /* @__PURE__ */ new Map([
  ["!", ["@"]],
  ["?", ["?", "@"]],
  ["@", ["@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@"]]
]);
var adoptionWithSpaceMap = /* @__PURE__ */ new Map([
  ["!", ["?"]],
  ["@", ["?"]],
  ["+", ["?", "*"]]
]);
var adoptionAnyMap = /* @__PURE__ */ new Map([
  ["!", ["?", "@"]],
  ["?", ["?", "@"]],
  ["@", ["?", "@"]],
  ["*", ["*", "+", "?", "@"]],
  ["+", ["+", "@", "?", "*"]]
]);
var usurpMap = /* @__PURE__ */ new Map([
  ["!", /* @__PURE__ */ new Map([["!", "@"]])],
  [
    "?",
    /* @__PURE__ */ new Map([
      ["*", "*"],
      ["+", "*"]
    ])
  ],
  [
    "@",
    /* @__PURE__ */ new Map([
      ["!", "!"],
      ["?", "?"],
      ["@", "@"],
      ["*", "*"],
      ["+", "+"]
    ])
  ],
  [
    "+",
    /* @__PURE__ */ new Map([
      ["?", "*"],
      ["*", "*"]
    ])
  ]
]);
var startNoTraversal = "(?!(?:^|/)\\.\\.?(?:$|/))";
var startNoDot = "(?!\\.)";
var addPatternStart = /* @__PURE__ */ new Set(["[", "."]);
var justDots = /* @__PURE__ */ new Set(["..", "."]);
var reSpecials = new Set("().*{}+?[]^$\\!");
var regExpEscape = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var qmark = "[^/]";
var star = qmark + "*?";
var starNoEmpty = qmark + "+?";
var ID = 0;
var AST = class {
  type;
  #root;
  #hasMagic;
  #uflag = false;
  #parts = [];
  #parent;
  #parentIndex;
  #negs;
  #filledNegs = false;
  #options;
  #toString;
  // set to true if it's an extglob with no children
  // (which really means one child of '')
  #emptyExt = false;
  id = ++ID;
  get depth() {
    return (this.#parent?.depth ?? -1) + 1;
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return {
      "@@type": "AST",
      id: this.id,
      type: this.type,
      root: this.#root.id,
      parent: this.#parent?.id,
      depth: this.depth,
      partsLength: this.#parts.length,
      parts: this.#parts
    };
  }
  constructor(type, parent, options = {}) {
    this.type = type;
    if (type)
      this.#hasMagic = true;
    this.#parent = parent;
    this.#root = this.#parent ? this.#parent.#root : this;
    this.#options = this.#root === this ? options : this.#root.#options;
    this.#negs = this.#root === this ? [] : this.#root.#negs;
    if (type === "!" && !this.#root.#filledNegs)
      this.#negs.push(this);
    this.#parentIndex = this.#parent ? this.#parent.#parts.length : 0;
  }
  get hasMagic() {
    if (this.#hasMagic !== void 0)
      return this.#hasMagic;
    for (const p of this.#parts) {
      if (typeof p === "string")
        continue;
      if (p.type || p.hasMagic)
        return this.#hasMagic = true;
    }
    return this.#hasMagic;
  }
  // reconstructs the pattern
  toString() {
    return this.#toString !== void 0 ? this.#toString : !this.type ? this.#toString = this.#parts.map((p) => String(p)).join("") : this.#toString = this.type + "(" + this.#parts.map((p) => String(p)).join("|") + ")";
  }
  #fillNegs() {
    if (this !== this.#root)
      throw new Error("should only call on root");
    if (this.#filledNegs)
      return this;
    this.toString();
    this.#filledNegs = true;
    let n;
    while (n = this.#negs.pop()) {
      if (n.type !== "!")
        continue;
      let p = n;
      let pp = p.#parent;
      while (pp) {
        for (let i = p.#parentIndex + 1; !pp.type && i < pp.#parts.length; i++) {
          for (const part of n.#parts) {
            if (typeof part === "string") {
              throw new Error("string part in extglob AST??");
            }
            part.copyIn(pp.#parts[i]);
          }
        }
        p = pp;
        pp = p.#parent;
      }
    }
    return this;
  }
  push(...parts) {
    for (const p of parts) {
      if (p === "")
        continue;
      if (typeof p !== "string" && !(p instanceof _a && p.#parent === this)) {
        throw new Error("invalid part: " + p);
      }
      this.#parts.push(p);
    }
  }
  toJSON() {
    const ret = this.type === null ? this.#parts.slice().map((p) => typeof p === "string" ? p : p.toJSON()) : [this.type, ...this.#parts.map((p) => p.toJSON())];
    if (this.isStart() && !this.type)
      ret.unshift([]);
    if (this.isEnd() && (this === this.#root || this.#root.#filledNegs && this.#parent?.type === "!")) {
      ret.push({});
    }
    return ret;
  }
  isStart() {
    if (this.#root === this)
      return true;
    if (!this.#parent?.isStart())
      return false;
    if (this.#parentIndex === 0)
      return true;
    const p = this.#parent;
    for (let i = 0; i < this.#parentIndex; i++) {
      const pp = p.#parts[i];
      if (!(pp instanceof _a && pp.type === "!")) {
        return false;
      }
    }
    return true;
  }
  isEnd() {
    if (this.#root === this)
      return true;
    if (this.#parent?.type === "!")
      return true;
    if (!this.#parent?.isEnd())
      return false;
    if (!this.type)
      return this.#parent?.isEnd();
    const pl = this.#parent ? this.#parent.#parts.length : 0;
    return this.#parentIndex === pl - 1;
  }
  copyIn(part) {
    if (typeof part === "string")
      this.push(part);
    else
      this.push(part.clone(this));
  }
  clone(parent) {
    const c3 = new _a(this.type, parent);
    for (const p of this.#parts) {
      c3.copyIn(p);
    }
    return c3;
  }
  static #parseAST(str, ast, pos, opt, extDepth) {
    const maxDepth = opt.maxExtglobRecursion ?? 2;
    let escaping = false;
    let inBrace = false;
    let braceStart = -1;
    let braceNeg = false;
    if (ast.type === null) {
      let i2 = pos;
      let acc2 = "";
      while (i2 < str.length) {
        const c3 = str.charAt(i2++);
        if (escaping || c3 === "\\") {
          escaping = !escaping;
          acc2 += c3;
          continue;
        }
        if (inBrace) {
          if (i2 === braceStart + 1) {
            if (c3 === "^" || c3 === "!") {
              braceNeg = true;
            }
          } else if (c3 === "]" && !(i2 === braceStart + 2 && braceNeg)) {
            inBrace = false;
          }
          acc2 += c3;
          continue;
        } else if (c3 === "[") {
          inBrace = true;
          braceStart = i2;
          braceNeg = false;
          acc2 += c3;
          continue;
        }
        const doRecurse = !opt.noext && isExtglobType(c3) && str.charAt(i2) === "(" && extDepth <= maxDepth;
        if (doRecurse) {
          ast.push(acc2);
          acc2 = "";
          const ext2 = new _a(c3, ast);
          i2 = _a.#parseAST(str, ext2, i2, opt, extDepth + 1);
          ast.push(ext2);
          continue;
        }
        acc2 += c3;
      }
      ast.push(acc2);
      return i2;
    }
    let i = pos + 1;
    let part = new _a(null, ast);
    const parts = [];
    let acc = "";
    while (i < str.length) {
      const c3 = str.charAt(i++);
      if (escaping || c3 === "\\") {
        escaping = !escaping;
        acc += c3;
        continue;
      }
      if (inBrace) {
        if (i === braceStart + 1) {
          if (c3 === "^" || c3 === "!") {
            braceNeg = true;
          }
        } else if (c3 === "]" && !(i === braceStart + 2 && braceNeg)) {
          inBrace = false;
        }
        acc += c3;
        continue;
      } else if (c3 === "[") {
        inBrace = true;
        braceStart = i;
        braceNeg = false;
        acc += c3;
        continue;
      }
      const doRecurse = !opt.noext && isExtglobType(c3) && str.charAt(i) === "(" && /* c8 ignore start - the maxDepth is sufficient here */
      (extDepth <= maxDepth || ast && ast.#canAdoptType(c3));
      if (doRecurse) {
        const depthAdd = ast && ast.#canAdoptType(c3) ? 0 : 1;
        part.push(acc);
        acc = "";
        const ext2 = new _a(c3, part);
        part.push(ext2);
        i = _a.#parseAST(str, ext2, i, opt, extDepth + depthAdd);
        continue;
      }
      if (c3 === "|") {
        part.push(acc);
        acc = "";
        parts.push(part);
        part = new _a(null, ast);
        continue;
      }
      if (c3 === ")") {
        if (acc === "" && ast.#parts.length === 0) {
          ast.#emptyExt = true;
        }
        part.push(acc);
        acc = "";
        ast.push(...parts, part);
        return i;
      }
      acc += c3;
    }
    ast.type = null;
    ast.#hasMagic = void 0;
    ast.#parts = [str.substring(pos - 1)];
    return i;
  }
  #canAdoptWithSpace(child) {
    return this.#canAdopt(child, adoptionWithSpaceMap);
  }
  #canAdopt(child, map = adoptionMap) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canAdoptType(gc.type, map);
  }
  #canAdoptType(c3, map = adoptionAnyMap) {
    return !!map.get(this.type)?.includes(c3);
  }
  #adoptWithSpace(child, index) {
    const gc = child.#parts[0];
    const blank = new _a(null, gc, this.options);
    blank.#parts.push("");
    gc.push(blank);
    this.#adopt(child, index);
  }
  #adopt(child, index) {
    const gc = child.#parts[0];
    this.#parts.splice(index, 1, ...gc.#parts);
    for (const p of gc.#parts) {
      if (typeof p === "object")
        p.#parent = this;
    }
    this.#toString = void 0;
  }
  #canUsurpType(c3) {
    const m = usurpMap.get(this.type);
    return !!m?.has(c3);
  }
  #canUsurp(child) {
    if (!child || typeof child !== "object" || child.type !== null || child.#parts.length !== 1 || this.type === null || this.#parts.length !== 1) {
      return false;
    }
    const gc = child.#parts[0];
    if (!gc || typeof gc !== "object" || gc.type === null) {
      return false;
    }
    return this.#canUsurpType(gc.type);
  }
  #usurp(child) {
    const m = usurpMap.get(this.type);
    const gc = child.#parts[0];
    const nt = m?.get(gc.type);
    if (!nt)
      return false;
    this.#parts = gc.#parts;
    for (const p of this.#parts) {
      if (typeof p === "object") {
        p.#parent = this;
      }
    }
    this.type = nt;
    this.#toString = void 0;
    this.#emptyExt = false;
  }
  static fromGlob(pattern, options = {}) {
    const ast = new _a(null, void 0, options);
    _a.#parseAST(pattern, ast, 0, options, 0);
    return ast;
  }
  // returns the regular expression if there's magic, or the unescaped
  // string if not.
  toMMPattern() {
    if (this !== this.#root)
      return this.#root.toMMPattern();
    const glob2 = this.toString();
    const [re, body, hasMagic2, uflag] = this.toRegExpSource();
    const anyMagic = hasMagic2 || this.#hasMagic || this.#options.nocase && !this.#options.nocaseMagicOnly && glob2.toUpperCase() !== glob2.toLowerCase();
    if (!anyMagic) {
      return body;
    }
    const flags = (this.#options.nocase ? "i" : "") + (uflag ? "u" : "");
    return Object.assign(new RegExp(`^${re}$`, flags), {
      _src: re,
      _glob: glob2
    });
  }
  get options() {
    return this.#options;
  }
  // returns the string match, the regexp source, whether there's magic
  // in the regexp (so a regular expression is required) and whether or
  // not the uflag is needed for the regular expression (for posix classes)
  // TODO: instead of injecting the start/end at this point, just return
  // the BODY of the regexp, along with the start/end portions suitable
  // for binding the start/end in either a joined full-path makeRe context
  // (where we bind to (^|/), or a standalone matchPart context (where
  // we bind to ^, and not /).  Otherwise slashes get duped!
  //
  // In part-matching mode, the start is:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: ^(?!\.\.?$)
  // - if dots allowed or not possible: ^
  // - if dots possible and not allowed: ^(?!\.)
  // end is:
  // - if not isEnd(): nothing
  // - else: $
  //
  // In full-path matching mode, we put the slash at the START of the
  // pattern, so start is:
  // - if first pattern: same as part-matching mode
  // - if not isStart(): nothing
  // - if traversal possible, but not allowed: /(?!\.\.?(?:$|/))
  // - if dots allowed or not possible: /
  // - if dots possible and not allowed: /(?!\.)
  // end is:
  // - if last pattern, same as part-matching mode
  // - else nothing
  //
  // Always put the (?:$|/) on negated tails, though, because that has to be
  // there to bind the end of the negated pattern portion, and it's easier to
  // just stick it in now rather than try to inject it later in the middle of
  // the pattern.
  //
  // We can just always return the same end, and leave it up to the caller
  // to know whether it's going to be used joined or in parts.
  // And, if the start is adjusted slightly, can do the same there:
  // - if not isStart: nothing
  // - if traversal possible, but not allowed: (?:/|^)(?!\.\.?$)
  // - if dots allowed or not possible: (?:/|^)
  // - if dots possible and not allowed: (?:/|^)(?!\.)
  //
  // But it's better to have a simpler binding without a conditional, for
  // performance, so probably better to return both start options.
  //
  // Then the caller just ignores the end if it's not the first pattern,
  // and the start always gets applied.
  //
  // But that's always going to be $ if it's the ending pattern, or nothing,
  // so the caller can just attach $ at the end of the pattern when building.
  //
  // So the todo is:
  // - better detect what kind of start is needed
  // - return both flavors of starting pattern
  // - attach $ at the end of the pattern when creating the actual RegExp
  //
  // Ah, but wait, no, that all only applies to the root when the first pattern
  // is not an extglob. If the first pattern IS an extglob, then we need all
  // that dot prevention biz to live in the extglob portions, because eg
  // +(*|.x*) can match .xy but not .yx.
  //
  // So, return the two flavors if it's #root and the first child is not an
  // AST, otherwise leave it to the child AST to handle it, and there,
  // use the (?:^|/) style of start binding.
  //
  // Even simplified further:
  // - Since the start for a join is eg /(?!\.) and the start for a part
  // is ^(?!\.), we can just prepend (?!\.) to the pattern (either root
  // or start or whatever) and prepend ^ or / at the Regexp construction.
  toRegExpSource(allowDot) {
    const dot = allowDot ?? !!this.#options.dot;
    if (this.#root === this) {
      this.#flatten();
      this.#fillNegs();
    }
    if (!isExtglobAST(this)) {
      const noEmpty = this.isStart() && this.isEnd() && !this.#parts.some((s) => typeof s !== "string");
      const src = this.#parts.map((p) => {
        const [re, _, hasMagic2, uflag] = typeof p === "string" ? _a.#parseGlob(p, this.#hasMagic, noEmpty) : p.toRegExpSource(allowDot);
        this.#hasMagic = this.#hasMagic || hasMagic2;
        this.#uflag = this.#uflag || uflag;
        return re;
      }).join("");
      let start2 = "";
      if (this.isStart()) {
        if (typeof this.#parts[0] === "string") {
          const dotTravAllowed = this.#parts.length === 1 && justDots.has(this.#parts[0]);
          if (!dotTravAllowed) {
            const aps = addPatternStart;
            const needNoTrav = (
              // dots are allowed, and the pattern starts with [ or .
              dot && aps.has(src.charAt(0)) || // the pattern starts with \., and then [ or .
              src.startsWith("\\.") && aps.has(src.charAt(2)) || // the pattern starts with \.\., and then [ or .
              src.startsWith("\\.\\.") && aps.has(src.charAt(4))
            );
            const needNoDot = !dot && !allowDot && aps.has(src.charAt(0));
            start2 = needNoTrav ? startNoTraversal : needNoDot ? startNoDot : "";
          }
        }
      }
      let end = "";
      if (this.isEnd() && this.#root.#filledNegs && this.#parent?.type === "!") {
        end = "(?:$|\\/)";
      }
      const final2 = start2 + src + end;
      return [
        final2,
        unescape(src),
        this.#hasMagic = !!this.#hasMagic,
        this.#uflag
      ];
    }
    const repeated = this.type === "*" || this.type === "+";
    const start = this.type === "!" ? "(?:(?!(?:" : "(?:";
    let body = this.#partsToRegExp(dot);
    if (this.isStart() && this.isEnd() && !body && this.type !== "!") {
      const s = this.toString();
      const me = this;
      me.#parts = [s];
      me.type = null;
      me.#hasMagic = void 0;
      return [s, unescape(this.toString()), false, false];
    }
    let bodyDotAllowed = !repeated || allowDot || dot || !startNoDot ? "" : this.#partsToRegExp(true);
    if (bodyDotAllowed === body) {
      bodyDotAllowed = "";
    }
    if (bodyDotAllowed) {
      body = `(?:${body})(?:${bodyDotAllowed})*?`;
    }
    let final = "";
    if (this.type === "!" && this.#emptyExt) {
      final = (this.isStart() && !dot ? startNoDot : "") + starNoEmpty;
    } else {
      const close = this.type === "!" ? (
        // !() must match something,but !(x) can match ''
        "))" + (this.isStart() && !dot && !allowDot ? startNoDot : "") + star + ")"
      ) : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && bodyDotAllowed ? ")" : this.type === "*" && bodyDotAllowed ? `)?` : `)${this.type}`;
      final = start + body + close;
    }
    return [
      final,
      unescape(body),
      this.#hasMagic = !!this.#hasMagic,
      this.#uflag
    ];
  }
  #flatten() {
    if (!isExtglobAST(this)) {
      for (const p of this.#parts) {
        if (typeof p === "object") {
          p.#flatten();
        }
      }
    } else {
      let iterations = 0;
      let done = false;
      do {
        done = true;
        for (let i = 0; i < this.#parts.length; i++) {
          const c3 = this.#parts[i];
          if (typeof c3 === "object") {
            c3.#flatten();
            if (this.#canAdopt(c3)) {
              done = false;
              this.#adopt(c3, i);
            } else if (this.#canAdoptWithSpace(c3)) {
              done = false;
              this.#adoptWithSpace(c3, i);
            } else if (this.#canUsurp(c3)) {
              done = false;
              this.#usurp(c3);
            }
          }
        }
      } while (!done && ++iterations < 10);
    }
    this.#toString = void 0;
  }
  #partsToRegExp(dot) {
    return this.#parts.map((p) => {
      if (typeof p === "string") {
        throw new Error("string type in extglob ast??");
      }
      const [re, _, _hasMagic, uflag] = p.toRegExpSource(dot);
      this.#uflag = this.#uflag || uflag;
      return re;
    }).filter((p) => !(this.isStart() && this.isEnd()) || !!p).join("|");
  }
  static #parseGlob(glob2, hasMagic2, noEmpty = false) {
    let escaping = false;
    let re = "";
    let uflag = false;
    let inStar = false;
    for (let i = 0; i < glob2.length; i++) {
      const c3 = glob2.charAt(i);
      if (escaping) {
        escaping = false;
        re += (reSpecials.has(c3) ? "\\" : "") + c3;
        continue;
      }
      if (c3 === "*") {
        if (inStar)
          continue;
        inStar = true;
        re += noEmpty && /^[*]+$/.test(glob2) ? starNoEmpty : star;
        hasMagic2 = true;
        continue;
      } else {
        inStar = false;
      }
      if (c3 === "\\") {
        if (i === glob2.length - 1) {
          re += "\\\\";
        } else {
          escaping = true;
        }
        continue;
      }
      if (c3 === "[") {
        const [src, needUflag, consumed, magic] = parseClass(glob2, i);
        if (consumed) {
          re += src;
          uflag = uflag || needUflag;
          i += consumed - 1;
          hasMagic2 = hasMagic2 || magic;
          continue;
        }
      }
      if (c3 === "?") {
        re += qmark;
        hasMagic2 = true;
        continue;
      }
      re += regExpEscape(c3);
    }
    return [re, unescape(glob2), !!hasMagic2, uflag];
  }
};
_a = AST;

// node_modules/minimatch/dist/esm/escape.js
var escape = (s, { windowsPathsNoEscape = false, magicalBraces = false } = {}) => {
  if (magicalBraces) {
    return windowsPathsNoEscape ? s.replace(/[?*()[\]{}]/g, "[$&]") : s.replace(/[?*()[\]\\{}]/g, "\\$&");
  }
  return windowsPathsNoEscape ? s.replace(/[?*()[\]]/g, "[$&]") : s.replace(/[?*()[\]\\]/g, "\\$&");
};

// node_modules/minimatch/dist/esm/index.js
var minimatch = (p, pattern, options = {}) => {
  assertValidPattern(pattern);
  if (!options.nocomment && pattern.charAt(0) === "#") {
    return false;
  }
  return new Minimatch(pattern, options).match(p);
};
var starDotExtRE = /^\*+([^+@!?*[(]*)$/;
var starDotExtTest = (ext2) => (f) => !f.startsWith(".") && f.endsWith(ext2);
var starDotExtTestDot = (ext2) => (f) => f.endsWith(ext2);
var starDotExtTestNocase = (ext2) => {
  ext2 = ext2.toLowerCase();
  return (f) => !f.startsWith(".") && f.toLowerCase().endsWith(ext2);
};
var starDotExtTestNocaseDot = (ext2) => {
  ext2 = ext2.toLowerCase();
  return (f) => f.toLowerCase().endsWith(ext2);
};
var starDotStarRE = /^\*+\.\*+$/;
var starDotStarTest = (f) => !f.startsWith(".") && f.includes(".");
var starDotStarTestDot = (f) => f !== "." && f !== ".." && f.includes(".");
var dotStarRE = /^\.\*+$/;
var dotStarTest = (f) => f !== "." && f !== ".." && f.startsWith(".");
var starRE = /^\*+$/;
var starTest = (f) => f.length !== 0 && !f.startsWith(".");
var starTestDot = (f) => f.length !== 0 && f !== "." && f !== "..";
var qmarksRE = /^\?+([^+@!?*[(]*)?$/;
var qmarksTestNocase = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  if (!ext2)
    return noext;
  ext2 = ext2.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext2);
};
var qmarksTestNocaseDot = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  if (!ext2)
    return noext;
  ext2 = ext2.toLowerCase();
  return (f) => noext(f) && f.toLowerCase().endsWith(ext2);
};
var qmarksTestDot = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExtDot([$0]);
  return !ext2 ? noext : (f) => noext(f) && f.endsWith(ext2);
};
var qmarksTest = ([$0, ext2 = ""]) => {
  const noext = qmarksTestNoExt([$0]);
  return !ext2 ? noext : (f) => noext(f) && f.endsWith(ext2);
};
var qmarksTestNoExt = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && !f.startsWith(".");
};
var qmarksTestNoExtDot = ([$0]) => {
  const len = $0.length;
  return (f) => f.length === len && f !== "." && f !== "..";
};
var defaultPlatform = typeof process === "object" && process ? typeof process.env === "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
var path = {
  win32: { sep: "\\" },
  posix: { sep: "/" }
};
var sep = defaultPlatform === "win32" ? path.win32.sep : path.posix.sep;
minimatch.sep = sep;
var GLOBSTAR = /* @__PURE__ */ Symbol("globstar **");
minimatch.GLOBSTAR = GLOBSTAR;
var qmark2 = "[^/]";
var star2 = qmark2 + "*?";
var twoStarDot = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
var twoStarNoDot = "(?:(?!(?:\\/|^)\\.).)*?";
var filter = (pattern, options = {}) => (p) => minimatch(p, pattern, options);
minimatch.filter = filter;
var ext = (a, b = {}) => Object.assign({}, a, b);
var defaults = (def) => {
  if (!def || typeof def !== "object" || !Object.keys(def).length) {
    return minimatch;
  }
  const orig = minimatch;
  const m = (p, pattern, options = {}) => orig(p, pattern, ext(def, options));
  return Object.assign(m, {
    Minimatch: class Minimatch extends orig.Minimatch {
      constructor(pattern, options = {}) {
        super(pattern, ext(def, options));
      }
      static defaults(options) {
        return orig.defaults(ext(def, options)).Minimatch;
      }
    },
    AST: class AST extends orig.AST {
      /* c8 ignore start */
      constructor(type, parent, options = {}) {
        super(type, parent, ext(def, options));
      }
      /* c8 ignore stop */
      static fromGlob(pattern, options = {}) {
        return orig.AST.fromGlob(pattern, ext(def, options));
      }
    },
    unescape: (s, options = {}) => orig.unescape(s, ext(def, options)),
    escape: (s, options = {}) => orig.escape(s, ext(def, options)),
    filter: (pattern, options = {}) => orig.filter(pattern, ext(def, options)),
    defaults: (options) => orig.defaults(ext(def, options)),
    makeRe: (pattern, options = {}) => orig.makeRe(pattern, ext(def, options)),
    braceExpand: (pattern, options = {}) => orig.braceExpand(pattern, ext(def, options)),
    match: (list, pattern, options = {}) => orig.match(list, pattern, ext(def, options)),
    sep: orig.sep,
    GLOBSTAR
  });
};
minimatch.defaults = defaults;
var braceExpand = (pattern, options = {}) => {
  assertValidPattern(pattern);
  if (options.nobrace || !/\{(?:(?!\{).)*\}/.test(pattern)) {
    return [pattern];
  }
  return expand(pattern, { max: options.braceExpandMax });
};
minimatch.braceExpand = braceExpand;
var makeRe = (pattern, options = {}) => new Minimatch(pattern, options).makeRe();
minimatch.makeRe = makeRe;
var match = (list, pattern, options = {}) => {
  const mm = new Minimatch(pattern, options);
  list = list.filter((f) => mm.match(f));
  if (mm.options.nonull && !list.length) {
    list.push(pattern);
  }
  return list;
};
minimatch.match = match;
var globMagic = /[?*]|[+@!]\(.*?\)|\[|\]/;
var regExpEscape2 = (s) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var Minimatch = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  maxGlobstarRecursion;
  regexp;
  constructor(pattern, options = {}) {
    assertValidPattern(pattern);
    options = options || {};
    this.options = options;
    this.maxGlobstarRecursion = options.maxGlobstarRecursion ?? 200;
    this.pattern = pattern;
    this.platform = options.platform || defaultPlatform;
    this.isWindows = this.platform === "win32";
    const awe = "allowWindowsEscape";
    this.windowsPathsNoEscape = !!options.windowsPathsNoEscape || options[awe] === false;
    if (this.windowsPathsNoEscape) {
      this.pattern = this.pattern.replace(/\\/g, "/");
    }
    this.preserveMultipleSlashes = !!options.preserveMultipleSlashes;
    this.regexp = null;
    this.negate = false;
    this.nonegate = !!options.nonegate;
    this.comment = false;
    this.empty = false;
    this.partial = !!options.partial;
    this.nocase = !!this.options.nocase;
    this.windowsNoMagicRoot = options.windowsNoMagicRoot !== void 0 ? options.windowsNoMagicRoot : !!(this.isWindows && this.nocase);
    this.globSet = [];
    this.globParts = [];
    this.set = [];
    this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) {
      return true;
    }
    for (const pattern of this.set) {
      for (const part of pattern) {
        if (typeof part !== "string")
          return true;
      }
    }
    return false;
  }
  debug(..._) {
  }
  make() {
    const pattern = this.pattern;
    const options = this.options;
    if (!options.nocomment && pattern.charAt(0) === "#") {
      this.comment = true;
      return;
    }
    if (!pattern) {
      this.empty = true;
      return;
    }
    this.parseNegate();
    this.globSet = [...new Set(this.braceExpand())];
    if (options.debug) {
      this.debug = (...args) => console.error(...args);
    }
    this.debug(this.pattern, this.globSet);
    const rawGlobParts = this.globSet.map((s) => this.slashSplit(s));
    this.globParts = this.preprocess(rawGlobParts);
    this.debug(this.pattern, this.globParts);
    let set = this.globParts.map((s, _, __) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        const isUNC = s[0] === "" && s[1] === "" && (s[2] === "?" || !globMagic.test(s[2])) && !globMagic.test(s[3]);
        const isDrive = /^[a-z]:/i.test(s[0]);
        if (isUNC) {
          return [
            ...s.slice(0, 4),
            ...s.slice(4).map((ss) => this.parse(ss))
          ];
        } else if (isDrive) {
          return [s[0], ...s.slice(1).map((ss) => this.parse(ss))];
        }
      }
      return s.map((ss) => this.parse(ss));
    });
    this.debug(this.pattern, set);
    this.set = set.filter((s) => s.indexOf(false) === -1);
    if (this.isWindows) {
      for (let i = 0; i < this.set.length; i++) {
        const p = this.set[i];
        if (p[0] === "" && p[1] === "" && this.globParts[i][2] === "?" && typeof p[3] === "string" && /^[a-z]:$/i.test(p[3])) {
          p[2] = "?";
        }
      }
    }
    this.debug(this.pattern, this.set);
  }
  // various transforms to equivalent pattern sets that are
  // faster to process in a filesystem walk.  The goal is to
  // eliminate what we can, and push all ** patterns as far
  // to the right as possible, even if it increases the number
  // of patterns that we have to process.
  preprocess(globParts) {
    if (this.options.noglobstar) {
      for (const partset of globParts) {
        for (let j = 0; j < partset.length; j++) {
          if (partset[j] === "**") {
            partset[j] = "*";
          }
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      globParts = this.firstPhasePreProcess(globParts);
      globParts = this.secondPhasePreProcess(globParts);
    } else if (optimizationLevel >= 1) {
      globParts = this.levelOneOptimize(globParts);
    } else {
      globParts = this.adjascentGlobstarOptimize(globParts);
    }
    return globParts;
  }
  // just get rid of adjascent ** portions
  adjascentGlobstarOptimize(globParts) {
    return globParts.map((parts) => {
      let gs = -1;
      while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
        let i = gs;
        while (parts[i + 1] === "**") {
          i++;
        }
        if (i !== gs) {
          parts.splice(gs, i - gs);
        }
      }
      return parts;
    });
  }
  // get rid of adjascent ** and resolve .. portions
  levelOneOptimize(globParts) {
    return globParts.map((parts) => {
      parts = parts.reduce((set, part) => {
        const prev = set[set.length - 1];
        if (part === "**" && prev === "**") {
          return set;
        }
        if (part === "..") {
          if (prev && prev !== ".." && prev !== "." && prev !== "**") {
            set.pop();
            return set;
          }
        }
        set.push(part);
        return set;
      }, []);
      return parts.length === 0 ? [""] : parts;
    });
  }
  levelTwoFileOptimize(parts) {
    if (!Array.isArray(parts)) {
      parts = this.slashSplit(parts);
    }
    let didSomething = false;
    do {
      didSomething = false;
      if (!this.preserveMultipleSlashes) {
        for (let i = 1; i < parts.length - 1; i++) {
          const p = parts[i];
          if (i === 1 && p === "" && parts[0] === "")
            continue;
          if (p === "." || p === "") {
            didSomething = true;
            parts.splice(i, 1);
            i--;
          }
        }
        if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
          didSomething = true;
          parts.pop();
        }
      }
      let dd = 0;
      while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
        const p = parts[dd - 1];
        if (p && p !== "." && p !== ".." && p !== "**" && !(this.isWindows && /^[a-z]:$/i.test(p))) {
          didSomething = true;
          parts.splice(dd - 1, 2);
          dd -= 2;
        }
      }
    } while (didSomething);
    return parts.length === 0 ? [""] : parts;
  }
  // First phase: single-pattern processing
  // <pre> is 1 or more portions
  // <rest> is 1 or more portions
  // <p> is any portion other than ., .., '', or **
  // <e> is . or ''
  //
  // **/.. is *brutal* for filesystem walking performance, because
  // it effectively resets the recursive walk each time it occurs,
  // and ** cannot be reduced out by a .. pattern part like a regexp
  // or most strings (other than .., ., and '') can be.
  //
  // <pre>/**/../<p>/<p>/<rest> -> {<pre>/../<p>/<p>/<rest>,<pre>/**/<p>/<p>/<rest>}
  // <pre>/<e>/<rest> -> <pre>/<rest>
  // <pre>/<p>/../<rest> -> <pre>/<rest>
  // **/**/<rest> -> **/<rest>
  //
  // **/*/<rest> -> */**/<rest> <== not valid because ** doesn't follow
  // this WOULD be allowed if ** did follow symlinks, or * didn't
  firstPhasePreProcess(globParts) {
    let didSomething = false;
    do {
      didSomething = false;
      for (let parts of globParts) {
        let gs = -1;
        while (-1 !== (gs = parts.indexOf("**", gs + 1))) {
          let gss = gs;
          while (parts[gss + 1] === "**") {
            gss++;
          }
          if (gss > gs) {
            parts.splice(gs + 1, gss - gs);
          }
          let next = parts[gs + 1];
          const p = parts[gs + 2];
          const p2 = parts[gs + 3];
          if (next !== "..")
            continue;
          if (!p || p === "." || p === ".." || !p2 || p2 === "." || p2 === "..") {
            continue;
          }
          didSomething = true;
          parts.splice(gs, 1);
          const other = parts.slice(0);
          other[gs] = "**";
          globParts.push(other);
          gs--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let i = 1; i < parts.length - 1; i++) {
            const p = parts[i];
            if (i === 1 && p === "" && parts[0] === "")
              continue;
            if (p === "." || p === "") {
              didSomething = true;
              parts.splice(i, 1);
              i--;
            }
          }
          if (parts[0] === "." && parts.length === 2 && (parts[1] === "." || parts[1] === "")) {
            didSomething = true;
            parts.pop();
          }
        }
        let dd = 0;
        while (-1 !== (dd = parts.indexOf("..", dd + 1))) {
          const p = parts[dd - 1];
          if (p && p !== "." && p !== ".." && p !== "**") {
            didSomething = true;
            const needDot = dd === 1 && parts[dd + 1] === "**";
            const splin = needDot ? ["."] : [];
            parts.splice(dd - 1, 2, ...splin);
            if (parts.length === 0)
              parts.push("");
            dd -= 2;
          }
        }
      }
    } while (didSomething);
    return globParts;
  }
  // second phase: multi-pattern dedupes
  // {<pre>/*/<rest>,<pre>/<p>/<rest>} -> <pre>/*/<rest>
  // {<pre>/<rest>,<pre>/<rest>} -> <pre>/<rest>
  // {<pre>/**/<rest>,<pre>/<rest>} -> <pre>/**/<rest>
  //
  // {<pre>/**/<rest>,<pre>/**/<p>/<rest>} -> <pre>/**/<rest>
  // ^-- not valid because ** doens't follow symlinks
  secondPhasePreProcess(globParts) {
    for (let i = 0; i < globParts.length - 1; i++) {
      for (let j = i + 1; j < globParts.length; j++) {
        const matched = this.partsMatch(globParts[i], globParts[j], !this.preserveMultipleSlashes);
        if (matched) {
          globParts[i] = [];
          globParts[j] = matched;
          break;
        }
      }
    }
    return globParts.filter((gs) => gs.length);
  }
  partsMatch(a, b, emptyGSMatch = false) {
    let ai = 0;
    let bi = 0;
    let result = [];
    let which = "";
    while (ai < a.length && bi < b.length) {
      if (a[ai] === b[bi]) {
        result.push(which === "b" ? b[bi] : a[ai]);
        ai++;
        bi++;
      } else if (emptyGSMatch && a[ai] === "**" && b[bi] === a[ai + 1]) {
        result.push(a[ai]);
        ai++;
      } else if (emptyGSMatch && b[bi] === "**" && a[ai] === b[bi + 1]) {
        result.push(b[bi]);
        bi++;
      } else if (a[ai] === "*" && b[bi] && (this.options.dot || !b[bi].startsWith(".")) && b[bi] !== "**") {
        if (which === "b")
          return false;
        which = "a";
        result.push(a[ai]);
        ai++;
        bi++;
      } else if (b[bi] === "*" && a[ai] && (this.options.dot || !a[ai].startsWith(".")) && a[ai] !== "**") {
        if (which === "a")
          return false;
        which = "b";
        result.push(b[bi]);
        ai++;
        bi++;
      } else {
        return false;
      }
    }
    return a.length === b.length && result;
  }
  parseNegate() {
    if (this.nonegate)
      return;
    const pattern = this.pattern;
    let negate = false;
    let negateOffset = 0;
    for (let i = 0; i < pattern.length && pattern.charAt(i) === "!"; i++) {
      negate = !negate;
      negateOffset++;
    }
    if (negateOffset)
      this.pattern = pattern.slice(negateOffset);
    this.negate = negate;
  }
  // set partial to true to test if, for example,
  // "/a/b" matches the start of "/*/b/*/d"
  // Partial means, if you run out of file before you run
  // out of pattern, then that's fine, as long as all
  // the parts match.
  matchOne(file, pattern, partial = false) {
    let fileStartIndex = 0;
    let patternStartIndex = 0;
    if (this.isWindows) {
      const fileDrive = typeof file[0] === "string" && /^[a-z]:$/i.test(file[0]);
      const fileUNC = !fileDrive && file[0] === "" && file[1] === "" && file[2] === "?" && /^[a-z]:$/i.test(file[3]);
      const patternDrive = typeof pattern[0] === "string" && /^[a-z]:$/i.test(pattern[0]);
      const patternUNC = !patternDrive && pattern[0] === "" && pattern[1] === "" && pattern[2] === "?" && typeof pattern[3] === "string" && /^[a-z]:$/i.test(pattern[3]);
      const fdi = fileUNC ? 3 : fileDrive ? 0 : void 0;
      const pdi = patternUNC ? 3 : patternDrive ? 0 : void 0;
      if (typeof fdi === "number" && typeof pdi === "number") {
        const [fd, pd] = [
          file[fdi],
          pattern[pdi]
        ];
        if (fd.toLowerCase() === pd.toLowerCase()) {
          pattern[pdi] = fd;
          patternStartIndex = pdi;
          fileStartIndex = fdi;
        }
      }
    }
    const { optimizationLevel = 1 } = this.options;
    if (optimizationLevel >= 2) {
      file = this.levelTwoFileOptimize(file);
    }
    if (pattern.includes(GLOBSTAR)) {
      return this.#matchGlobstar(file, pattern, partial, fileStartIndex, patternStartIndex);
    }
    return this.#matchOne(file, pattern, partial, fileStartIndex, patternStartIndex);
  }
  #matchGlobstar(file, pattern, partial, fileIndex, patternIndex) {
    const firstgs = pattern.indexOf(GLOBSTAR, patternIndex);
    const lastgs = pattern.lastIndexOf(GLOBSTAR);
    const [head, body, tail] = partial ? [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1),
      []
    ] : [
      pattern.slice(patternIndex, firstgs),
      pattern.slice(firstgs + 1, lastgs),
      pattern.slice(lastgs + 1)
    ];
    if (head.length) {
      const fileHead = file.slice(fileIndex, fileIndex + head.length);
      if (!this.#matchOne(fileHead, head, partial, 0, 0)) {
        return false;
      }
      fileIndex += head.length;
      patternIndex += head.length;
    }
    let fileTailMatch = 0;
    if (tail.length) {
      if (tail.length + fileIndex > file.length)
        return false;
      let tailStart = file.length - tail.length;
      if (this.#matchOne(file, tail, partial, tailStart, 0)) {
        fileTailMatch = tail.length;
      } else {
        if (file[file.length - 1] !== "" || fileIndex + tail.length === file.length) {
          return false;
        }
        tailStart--;
        if (!this.#matchOne(file, tail, partial, tailStart, 0)) {
          return false;
        }
        fileTailMatch = tail.length + 1;
      }
    }
    if (!body.length) {
      let sawSome = !!fileTailMatch;
      for (let i2 = fileIndex; i2 < file.length - fileTailMatch; i2++) {
        const f = String(file[i2]);
        sawSome = true;
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return partial || sawSome;
    }
    const bodySegments = [[[], 0]];
    let currentBody = bodySegments[0];
    let nonGsParts = 0;
    const nonGsPartsSums = [0];
    for (const b of body) {
      if (b === GLOBSTAR) {
        nonGsPartsSums.push(nonGsParts);
        currentBody = [[], 0];
        bodySegments.push(currentBody);
      } else {
        currentBody[0].push(b);
        nonGsParts++;
      }
    }
    let i = bodySegments.length - 1;
    const fileLength = file.length - fileTailMatch;
    for (const b of bodySegments) {
      b[1] = fileLength - (nonGsPartsSums[i--] + b[0].length);
    }
    return !!this.#matchGlobStarBodySections(file, bodySegments, fileIndex, 0, partial, 0, !!fileTailMatch);
  }
  // return false for "nope, not matching"
  // return null for "not matching, cannot keep trying"
  #matchGlobStarBodySections(file, bodySegments, fileIndex, bodyIndex, partial, globStarDepth, sawTail) {
    const bs = bodySegments[bodyIndex];
    if (!bs) {
      for (let i = fileIndex; i < file.length; i++) {
        sawTail = true;
        const f = file[i];
        if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
          return false;
        }
      }
      return sawTail;
    }
    const [body, after] = bs;
    while (fileIndex <= after) {
      const m = this.#matchOne(file.slice(0, fileIndex + body.length), body, partial, fileIndex, 0);
      if (m && globStarDepth < this.maxGlobstarRecursion) {
        const sub = this.#matchGlobStarBodySections(file, bodySegments, fileIndex + body.length, bodyIndex + 1, partial, globStarDepth + 1, sawTail);
        if (sub !== false) {
          return sub;
        }
      }
      const f = file[fileIndex];
      if (f === "." || f === ".." || !this.options.dot && f.startsWith(".")) {
        return false;
      }
      fileIndex++;
    }
    return partial || null;
  }
  #matchOne(file, pattern, partial, fileIndex, patternIndex) {
    let fi;
    let pi;
    let pl;
    let fl;
    for (fi = fileIndex, pi = patternIndex, fl = file.length, pl = pattern.length; fi < fl && pi < pl; fi++, pi++) {
      this.debug("matchOne loop");
      let p = pattern[pi];
      let f = file[fi];
      this.debug(pattern, p, f);
      if (p === false || p === GLOBSTAR) {
        return false;
      }
      let hit;
      if (typeof p === "string") {
        hit = f === p;
        this.debug("string match", p, f, hit);
      } else {
        hit = p.test(f);
        this.debug("pattern match", p, f, hit);
      }
      if (!hit)
        return false;
    }
    if (fi === fl && pi === pl) {
      return true;
    } else if (fi === fl) {
      return partial;
    } else if (pi === pl) {
      return fi === fl - 1 && file[fi] === "";
    } else {
      throw new Error("wtf?");
    }
  }
  braceExpand() {
    return braceExpand(this.pattern, this.options);
  }
  parse(pattern) {
    assertValidPattern(pattern);
    const options = this.options;
    if (pattern === "**")
      return GLOBSTAR;
    if (pattern === "")
      return "";
    let m;
    let fastTest = null;
    if (m = pattern.match(starRE)) {
      fastTest = options.dot ? starTestDot : starTest;
    } else if (m = pattern.match(starDotExtRE)) {
      fastTest = (options.nocase ? options.dot ? starDotExtTestNocaseDot : starDotExtTestNocase : options.dot ? starDotExtTestDot : starDotExtTest)(m[1]);
    } else if (m = pattern.match(qmarksRE)) {
      fastTest = (options.nocase ? options.dot ? qmarksTestNocaseDot : qmarksTestNocase : options.dot ? qmarksTestDot : qmarksTest)(m);
    } else if (m = pattern.match(starDotStarRE)) {
      fastTest = options.dot ? starDotStarTestDot : starDotStarTest;
    } else if (m = pattern.match(dotStarRE)) {
      fastTest = dotStarTest;
    }
    const re = AST.fromGlob(pattern, this.options).toMMPattern();
    if (fastTest && typeof re === "object") {
      Reflect.defineProperty(re, "test", { value: fastTest });
    }
    return re;
  }
  makeRe() {
    if (this.regexp || this.regexp === false)
      return this.regexp;
    const set = this.set;
    if (!set.length) {
      this.regexp = false;
      return this.regexp;
    }
    const options = this.options;
    const twoStar = options.noglobstar ? star2 : options.dot ? twoStarDot : twoStarNoDot;
    const flags = new Set(options.nocase ? ["i"] : []);
    let re = set.map((pattern) => {
      const pp = pattern.map((p) => {
        if (p instanceof RegExp) {
          for (const f of p.flags.split(""))
            flags.add(f);
        }
        return typeof p === "string" ? regExpEscape2(p) : p === GLOBSTAR ? GLOBSTAR : p._src;
      });
      pp.forEach((p, i) => {
        const next = pp[i + 1];
        const prev = pp[i - 1];
        if (p !== GLOBSTAR || prev === GLOBSTAR) {
          return;
        }
        if (prev === void 0) {
          if (next !== void 0 && next !== GLOBSTAR) {
            pp[i + 1] = "(?:\\/|" + twoStar + "\\/)?" + next;
          } else {
            pp[i] = twoStar;
          }
        } else if (next === void 0) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + ")?";
        } else if (next !== GLOBSTAR) {
          pp[i - 1] = prev + "(?:\\/|\\/" + twoStar + "\\/)" + next;
          pp[i + 1] = GLOBSTAR;
        }
      });
      const filtered = pp.filter((p) => p !== GLOBSTAR);
      if (this.partial && filtered.length >= 1) {
        const prefixes = [];
        for (let i = 1; i <= filtered.length; i++) {
          prefixes.push(filtered.slice(0, i).join("/"));
        }
        return "(?:" + prefixes.join("|") + ")";
      }
      return filtered.join("/");
    }).join("|");
    const [open, close] = set.length > 1 ? ["(?:", ")"] : ["", ""];
    re = "^" + open + re + close + "$";
    if (this.partial) {
      re = "^(?:\\/|" + open + re.slice(1, -1) + close + ")$";
    }
    if (this.negate)
      re = "^(?!" + re + ").+$";
    try {
      this.regexp = new RegExp(re, [...flags].join(""));
    } catch {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(p) {
    if (this.preserveMultipleSlashes) {
      return p.split("/");
    } else if (this.isWindows && /^\/\/[^/]+/.test(p)) {
      return ["", ...p.split(/\/+/)];
    } else {
      return p.split(/\/+/);
    }
  }
  match(f, partial = this.partial) {
    this.debug("match", f, this.pattern);
    if (this.comment) {
      return false;
    }
    if (this.empty) {
      return f === "";
    }
    if (f === "/" && partial) {
      return true;
    }
    const options = this.options;
    if (this.isWindows) {
      f = f.split("\\").join("/");
    }
    const ff = this.slashSplit(f);
    this.debug(this.pattern, "split", ff);
    const set = this.set;
    this.debug(this.pattern, "set", set);
    let filename = ff[ff.length - 1];
    if (!filename) {
      for (let i = ff.length - 2; !filename && i >= 0; i--) {
        filename = ff[i];
      }
    }
    for (const pattern of set) {
      let file = ff;
      if (options.matchBase && pattern.length === 1) {
        file = [filename];
      }
      const hit = this.matchOne(file, pattern, partial);
      if (hit) {
        if (options.flipNegate) {
          return true;
        }
        return !this.negate;
      }
    }
    if (options.flipNegate) {
      return false;
    }
    return this.negate;
  }
  static defaults(def) {
    return minimatch.defaults(def).Minimatch;
  }
};
minimatch.AST = AST;
minimatch.Minimatch = Minimatch;
minimatch.escape = escape;
minimatch.unescape = unescape;

// node_modules/glob/dist/esm/glob.js
import { fileURLToPath as fileURLToPath2 } from "url";

// node_modules/lru-cache/dist/esm/index.min.js
var x = typeof performance == "object" && performance && typeof performance.now == "function" ? performance : Date;
var I = /* @__PURE__ */ new Set();
var R = typeof process == "object" && process ? process : {};
var U = (c3, t, e, i) => {
  typeof R.emitWarning == "function" ? R.emitWarning(c3, t, e, i) : console.error(`[${e}] ${t}: ${c3}`);
};
var C = globalThis.AbortController;
var D = globalThis.AbortSignal;
if (typeof C > "u") {
  D = class {
    onabort;
    _onabort = [];
    reason;
    aborted = false;
    addEventListener(i, s) {
      this._onabort.push(s);
    }
  }, C = class {
    constructor() {
      t();
    }
    signal = new D();
    abort(i) {
      if (!this.signal.aborted) {
        this.signal.reason = i, this.signal.aborted = true;
        for (let s of this.signal._onabort) s(i);
        this.signal.onabort?.(i);
      }
    }
  };
  let c3 = R.env?.LRU_CACHE_IGNORE_AC_WARNING !== "1", t = () => {
    c3 && (c3 = false, U("AbortController is not defined. If using lru-cache in node 14, load an AbortController polyfill from the `node-abort-controller` package. A minimal polyfill is provided for use by LRUCache.fetch(), but it should not be relied upon in other contexts (eg, passing it to other APIs that use AbortController/AbortSignal might have undesirable effects). You may disable this with LRU_CACHE_IGNORE_AC_WARNING=1 in the env.", "NO_ABORT_CONTROLLER", "ENOTSUP", t));
  };
}
var G = (c3) => !I.has(c3);
var y = (c3) => c3 && c3 === Math.floor(c3) && c3 > 0 && isFinite(c3);
var M = (c3) => y(c3) ? c3 <= Math.pow(2, 8) ? Uint8Array : c3 <= Math.pow(2, 16) ? Uint16Array : c3 <= Math.pow(2, 32) ? Uint32Array : c3 <= Number.MAX_SAFE_INTEGER ? z : null : null;
var z = class extends Array {
  constructor(t) {
    super(t), this.fill(0);
  }
};
var W = class c {
  heap;
  length;
  static #o = false;
  static create(t) {
    let e = M(t);
    if (!e) return [];
    c.#o = true;
    let i = new c(t, e);
    return c.#o = false, i;
  }
  constructor(t, e) {
    if (!c.#o) throw new TypeError("instantiate Stack using Stack.create(n)");
    this.heap = new e(t), this.length = 0;
  }
  push(t) {
    this.heap[this.length++] = t;
  }
  pop() {
    return this.heap[--this.length];
  }
};
var L = class c2 {
  #o;
  #c;
  #w;
  #C;
  #S;
  #L;
  #I;
  #m;
  get perf() {
    return this.#m;
  }
  ttl;
  ttlResolution;
  ttlAutopurge;
  updateAgeOnGet;
  updateAgeOnHas;
  allowStale;
  noDisposeOnSet;
  noUpdateTTL;
  maxEntrySize;
  sizeCalculation;
  noDeleteOnFetchRejection;
  noDeleteOnStaleGet;
  allowStaleOnFetchAbort;
  allowStaleOnFetchRejection;
  ignoreFetchAbort;
  #n;
  #_;
  #s;
  #i;
  #t;
  #a;
  #u;
  #l;
  #h;
  #b;
  #r;
  #y;
  #A;
  #d;
  #g;
  #T;
  #v;
  #f;
  #U;
  static unsafeExposeInternals(t) {
    return { starts: t.#A, ttls: t.#d, autopurgeTimers: t.#g, sizes: t.#y, keyMap: t.#s, keyList: t.#i, valList: t.#t, next: t.#a, prev: t.#u, get head() {
      return t.#l;
    }, get tail() {
      return t.#h;
    }, free: t.#b, isBackgroundFetch: (e) => t.#e(e), backgroundFetch: (e, i, s, n) => t.#G(e, i, s, n), moveToTail: (e) => t.#D(e), indexes: (e) => t.#F(e), rindexes: (e) => t.#O(e), isStale: (e) => t.#p(e) };
  }
  get max() {
    return this.#o;
  }
  get maxSize() {
    return this.#c;
  }
  get calculatedSize() {
    return this.#_;
  }
  get size() {
    return this.#n;
  }
  get fetchMethod() {
    return this.#L;
  }
  get memoMethod() {
    return this.#I;
  }
  get dispose() {
    return this.#w;
  }
  get onInsert() {
    return this.#C;
  }
  get disposeAfter() {
    return this.#S;
  }
  constructor(t) {
    let { max: e = 0, ttl: i, ttlResolution: s = 1, ttlAutopurge: n, updateAgeOnGet: o, updateAgeOnHas: h, allowStale: r, dispose: a, onInsert: w, disposeAfter: f, noDisposeOnSet: d, noUpdateTTL: g, maxSize: A = 0, maxEntrySize: p = 0, sizeCalculation: _, fetchMethod: l, memoMethod: S, noDeleteOnFetchRejection: b, noDeleteOnStaleGet: m, allowStaleOnFetchRejection: u, allowStaleOnFetchAbort: T, ignoreFetchAbort: F, perf: v } = t;
    if (v !== void 0 && typeof v?.now != "function") throw new TypeError("perf option must have a now() method if specified");
    if (this.#m = v ?? x, e !== 0 && !y(e)) throw new TypeError("max option must be a nonnegative integer");
    let O = e ? M(e) : Array;
    if (!O) throw new Error("invalid max value: " + e);
    if (this.#o = e, this.#c = A, this.maxEntrySize = p || this.#c, this.sizeCalculation = _, this.sizeCalculation) {
      if (!this.#c && !this.maxEntrySize) throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
      if (typeof this.sizeCalculation != "function") throw new TypeError("sizeCalculation set to non-function");
    }
    if (S !== void 0 && typeof S != "function") throw new TypeError("memoMethod must be a function if defined");
    if (this.#I = S, l !== void 0 && typeof l != "function") throw new TypeError("fetchMethod must be a function if specified");
    if (this.#L = l, this.#v = !!l, this.#s = /* @__PURE__ */ new Map(), this.#i = new Array(e).fill(void 0), this.#t = new Array(e).fill(void 0), this.#a = new O(e), this.#u = new O(e), this.#l = 0, this.#h = 0, this.#b = W.create(e), this.#n = 0, this.#_ = 0, typeof a == "function" && (this.#w = a), typeof w == "function" && (this.#C = w), typeof f == "function" ? (this.#S = f, this.#r = []) : (this.#S = void 0, this.#r = void 0), this.#T = !!this.#w, this.#U = !!this.#C, this.#f = !!this.#S, this.noDisposeOnSet = !!d, this.noUpdateTTL = !!g, this.noDeleteOnFetchRejection = !!b, this.allowStaleOnFetchRejection = !!u, this.allowStaleOnFetchAbort = !!T, this.ignoreFetchAbort = !!F, this.maxEntrySize !== 0) {
      if (this.#c !== 0 && !y(this.#c)) throw new TypeError("maxSize must be a positive integer if specified");
      if (!y(this.maxEntrySize)) throw new TypeError("maxEntrySize must be a positive integer if specified");
      this.#B();
    }
    if (this.allowStale = !!r, this.noDeleteOnStaleGet = !!m, this.updateAgeOnGet = !!o, this.updateAgeOnHas = !!h, this.ttlResolution = y(s) || s === 0 ? s : 1, this.ttlAutopurge = !!n, this.ttl = i || 0, this.ttl) {
      if (!y(this.ttl)) throw new TypeError("ttl must be a positive integer if specified");
      this.#j();
    }
    if (this.#o === 0 && this.ttl === 0 && this.#c === 0) throw new TypeError("At least one of max, maxSize, or ttl is required");
    if (!this.ttlAutopurge && !this.#o && !this.#c) {
      let E = "LRU_CACHE_UNBOUNDED";
      G(E) && (I.add(E), U("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.", "UnboundedCacheWarning", E, c2));
    }
  }
  getRemainingTTL(t) {
    return this.#s.has(t) ? 1 / 0 : 0;
  }
  #j() {
    let t = new z(this.#o), e = new z(this.#o);
    this.#d = t, this.#A = e;
    let i = this.ttlAutopurge ? new Array(this.#o) : void 0;
    this.#g = i, this.#N = (h, r, a = this.#m.now()) => {
      e[h] = r !== 0 ? a : 0, t[h] = r, s(h, r);
    }, this.#R = (h) => {
      e[h] = t[h] !== 0 ? this.#m.now() : 0, s(h, t[h]);
    };
    let s = this.ttlAutopurge ? (h, r) => {
      if (i?.[h] && (clearTimeout(i[h]), i[h] = void 0), r && r !== 0 && i) {
        let a = setTimeout(() => {
          this.#p(h) && this.#E(this.#i[h], "expire");
        }, r + 1);
        a.unref && a.unref(), i[h] = a;
      }
    } : () => {
    };
    this.#z = (h, r) => {
      if (t[r]) {
        let a = t[r], w = e[r];
        if (!a || !w) return;
        h.ttl = a, h.start = w, h.now = n || o();
        let f = h.now - w;
        h.remainingTTL = a - f;
      }
    };
    let n = 0, o = () => {
      let h = this.#m.now();
      if (this.ttlResolution > 0) {
        n = h;
        let r = setTimeout(() => n = 0, this.ttlResolution);
        r.unref && r.unref();
      }
      return h;
    };
    this.getRemainingTTL = (h) => {
      let r = this.#s.get(h);
      if (r === void 0) return 0;
      let a = t[r], w = e[r];
      if (!a || !w) return 1 / 0;
      let f = (n || o()) - w;
      return a - f;
    }, this.#p = (h) => {
      let r = e[h], a = t[h];
      return !!a && !!r && (n || o()) - r > a;
    };
  }
  #R = () => {
  };
  #z = () => {
  };
  #N = () => {
  };
  #p = () => false;
  #B() {
    let t = new z(this.#o);
    this.#_ = 0, this.#y = t, this.#W = (e) => {
      this.#_ -= t[e], t[e] = 0;
    }, this.#P = (e, i, s, n) => {
      if (this.#e(i)) return 0;
      if (!y(s)) if (n) {
        if (typeof n != "function") throw new TypeError("sizeCalculation must be a function");
        if (s = n(i, e), !y(s)) throw new TypeError("sizeCalculation return invalid (expect positive integer)");
      } else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");
      return s;
    }, this.#M = (e, i, s) => {
      if (t[e] = i, this.#c) {
        let n = this.#c - t[e];
        for (; this.#_ > n; ) this.#x(true);
      }
      this.#_ += t[e], s && (s.entrySize = i, s.totalCalculatedSize = this.#_);
    };
  }
  #W = (t) => {
  };
  #M = (t, e, i) => {
  };
  #P = (t, e, i, s) => {
    if (i || s) throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
    return 0;
  };
  *#F({ allowStale: t = this.allowStale } = {}) {
    if (this.#n) for (let e = this.#h; !(!this.#H(e) || ((t || !this.#p(e)) && (yield e), e === this.#l)); ) e = this.#u[e];
  }
  *#O({ allowStale: t = this.allowStale } = {}) {
    if (this.#n) for (let e = this.#l; !(!this.#H(e) || ((t || !this.#p(e)) && (yield e), e === this.#h)); ) e = this.#a[e];
  }
  #H(t) {
    return t !== void 0 && this.#s.get(this.#i[t]) === t;
  }
  *entries() {
    for (let t of this.#F()) this.#t[t] !== void 0 && this.#i[t] !== void 0 && !this.#e(this.#t[t]) && (yield [this.#i[t], this.#t[t]]);
  }
  *rentries() {
    for (let t of this.#O()) this.#t[t] !== void 0 && this.#i[t] !== void 0 && !this.#e(this.#t[t]) && (yield [this.#i[t], this.#t[t]]);
  }
  *keys() {
    for (let t of this.#F()) {
      let e = this.#i[t];
      e !== void 0 && !this.#e(this.#t[t]) && (yield e);
    }
  }
  *rkeys() {
    for (let t of this.#O()) {
      let e = this.#i[t];
      e !== void 0 && !this.#e(this.#t[t]) && (yield e);
    }
  }
  *values() {
    for (let t of this.#F()) this.#t[t] !== void 0 && !this.#e(this.#t[t]) && (yield this.#t[t]);
  }
  *rvalues() {
    for (let t of this.#O()) this.#t[t] !== void 0 && !this.#e(this.#t[t]) && (yield this.#t[t]);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  [Symbol.toStringTag] = "LRUCache";
  find(t, e = {}) {
    for (let i of this.#F()) {
      let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
      if (n !== void 0 && t(n, this.#i[i], this)) return this.get(this.#i[i], e);
    }
  }
  forEach(t, e = this) {
    for (let i of this.#F()) {
      let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
      n !== void 0 && t.call(e, n, this.#i[i], this);
    }
  }
  rforEach(t, e = this) {
    for (let i of this.#O()) {
      let s = this.#t[i], n = this.#e(s) ? s.__staleWhileFetching : s;
      n !== void 0 && t.call(e, n, this.#i[i], this);
    }
  }
  purgeStale() {
    let t = false;
    for (let e of this.#O({ allowStale: true })) this.#p(e) && (this.#E(this.#i[e], "expire"), t = true);
    return t;
  }
  info(t) {
    let e = this.#s.get(t);
    if (e === void 0) return;
    let i = this.#t[e], s = this.#e(i) ? i.__staleWhileFetching : i;
    if (s === void 0) return;
    let n = { value: s };
    if (this.#d && this.#A) {
      let o = this.#d[e], h = this.#A[e];
      if (o && h) {
        let r = o - (this.#m.now() - h);
        n.ttl = r, n.start = Date.now();
      }
    }
    return this.#y && (n.size = this.#y[e]), n;
  }
  dump() {
    let t = [];
    for (let e of this.#F({ allowStale: true })) {
      let i = this.#i[e], s = this.#t[e], n = this.#e(s) ? s.__staleWhileFetching : s;
      if (n === void 0 || i === void 0) continue;
      let o = { value: n };
      if (this.#d && this.#A) {
        o.ttl = this.#d[e];
        let h = this.#m.now() - this.#A[e];
        o.start = Math.floor(Date.now() - h);
      }
      this.#y && (o.size = this.#y[e]), t.unshift([i, o]);
    }
    return t;
  }
  load(t) {
    this.clear();
    for (let [e, i] of t) {
      if (i.start) {
        let s = Date.now() - i.start;
        i.start = this.#m.now() - s;
      }
      this.set(e, i.value, i);
    }
  }
  set(t, e, i = {}) {
    if (e === void 0) return this.delete(t), this;
    let { ttl: s = this.ttl, start: n, noDisposeOnSet: o = this.noDisposeOnSet, sizeCalculation: h = this.sizeCalculation, status: r } = i, { noUpdateTTL: a = this.noUpdateTTL } = i, w = this.#P(t, e, i.size || 0, h);
    if (this.maxEntrySize && w > this.maxEntrySize) return r && (r.set = "miss", r.maxEntrySizeExceeded = true), this.#E(t, "set"), this;
    let f = this.#n === 0 ? void 0 : this.#s.get(t);
    if (f === void 0) f = this.#n === 0 ? this.#h : this.#b.length !== 0 ? this.#b.pop() : this.#n === this.#o ? this.#x(false) : this.#n, this.#i[f] = t, this.#t[f] = e, this.#s.set(t, f), this.#a[this.#h] = f, this.#u[f] = this.#h, this.#h = f, this.#n++, this.#M(f, w, r), r && (r.set = "add"), a = false, this.#U && this.#C?.(e, t, "add");
    else {
      this.#D(f);
      let d = this.#t[f];
      if (e !== d) {
        if (this.#v && this.#e(d)) {
          d.__abortController.abort(new Error("replaced"));
          let { __staleWhileFetching: g } = d;
          g !== void 0 && !o && (this.#T && this.#w?.(g, t, "set"), this.#f && this.#r?.push([g, t, "set"]));
        } else o || (this.#T && this.#w?.(d, t, "set"), this.#f && this.#r?.push([d, t, "set"]));
        if (this.#W(f), this.#M(f, w, r), this.#t[f] = e, r) {
          r.set = "replace";
          let g = d && this.#e(d) ? d.__staleWhileFetching : d;
          g !== void 0 && (r.oldValue = g);
        }
      } else r && (r.set = "update");
      this.#U && this.onInsert?.(e, t, e === d ? "update" : "replace");
    }
    if (s !== 0 && !this.#d && this.#j(), this.#d && (a || this.#N(f, s, n), r && this.#z(r, f)), !o && this.#f && this.#r) {
      let d = this.#r, g;
      for (; g = d?.shift(); ) this.#S?.(...g);
    }
    return this;
  }
  pop() {
    try {
      for (; this.#n; ) {
        let t = this.#t[this.#l];
        if (this.#x(true), this.#e(t)) {
          if (t.__staleWhileFetching) return t.__staleWhileFetching;
        } else if (t !== void 0) return t;
      }
    } finally {
      if (this.#f && this.#r) {
        let t = this.#r, e;
        for (; e = t?.shift(); ) this.#S?.(...e);
      }
    }
  }
  #x(t) {
    let e = this.#l, i = this.#i[e], s = this.#t[e];
    return this.#v && this.#e(s) ? s.__abortController.abort(new Error("evicted")) : (this.#T || this.#f) && (this.#T && this.#w?.(s, i, "evict"), this.#f && this.#r?.push([s, i, "evict"])), this.#W(e), this.#g?.[e] && (clearTimeout(this.#g[e]), this.#g[e] = void 0), t && (this.#i[e] = void 0, this.#t[e] = void 0, this.#b.push(e)), this.#n === 1 ? (this.#l = this.#h = 0, this.#b.length = 0) : this.#l = this.#a[e], this.#s.delete(i), this.#n--, e;
  }
  has(t, e = {}) {
    let { updateAgeOnHas: i = this.updateAgeOnHas, status: s } = e, n = this.#s.get(t);
    if (n !== void 0) {
      let o = this.#t[n];
      if (this.#e(o) && o.__staleWhileFetching === void 0) return false;
      if (this.#p(n)) s && (s.has = "stale", this.#z(s, n));
      else return i && this.#R(n), s && (s.has = "hit", this.#z(s, n)), true;
    } else s && (s.has = "miss");
    return false;
  }
  peek(t, e = {}) {
    let { allowStale: i = this.allowStale } = e, s = this.#s.get(t);
    if (s === void 0 || !i && this.#p(s)) return;
    let n = this.#t[s];
    return this.#e(n) ? n.__staleWhileFetching : n;
  }
  #G(t, e, i, s) {
    let n = e === void 0 ? void 0 : this.#t[e];
    if (this.#e(n)) return n;
    let o = new C(), { signal: h } = i;
    h?.addEventListener("abort", () => o.abort(h.reason), { signal: o.signal });
    let r = { signal: o.signal, options: i, context: s }, a = (p, _ = false) => {
      let { aborted: l } = o.signal, S = i.ignoreFetchAbort && p !== void 0, b = i.ignoreFetchAbort || !!(i.allowStaleOnFetchAbort && p !== void 0);
      if (i.status && (l && !_ ? (i.status.fetchAborted = true, i.status.fetchError = o.signal.reason, S && (i.status.fetchAbortIgnored = true)) : i.status.fetchResolved = true), l && !S && !_) return f(o.signal.reason, b);
      let m = g, u = this.#t[e];
      return (u === g || S && _ && u === void 0) && (p === void 0 ? m.__staleWhileFetching !== void 0 ? this.#t[e] = m.__staleWhileFetching : this.#E(t, "fetch") : (i.status && (i.status.fetchUpdated = true), this.set(t, p, r.options))), p;
    }, w = (p) => (i.status && (i.status.fetchRejected = true, i.status.fetchError = p), f(p, false)), f = (p, _) => {
      let { aborted: l } = o.signal, S = l && i.allowStaleOnFetchAbort, b = S || i.allowStaleOnFetchRejection, m = b || i.noDeleteOnFetchRejection, u = g;
      if (this.#t[e] === g && (!m || !_ && u.__staleWhileFetching === void 0 ? this.#E(t, "fetch") : S || (this.#t[e] = u.__staleWhileFetching)), b) return i.status && u.__staleWhileFetching !== void 0 && (i.status.returnedStale = true), u.__staleWhileFetching;
      if (u.__returned === u) throw p;
    }, d = (p, _) => {
      let l = this.#L?.(t, n, r);
      l && l instanceof Promise && l.then((S) => p(S === void 0 ? void 0 : S), _), o.signal.addEventListener("abort", () => {
        (!i.ignoreFetchAbort || i.allowStaleOnFetchAbort) && (p(void 0), i.allowStaleOnFetchAbort && (p = (S) => a(S, true)));
      });
    };
    i.status && (i.status.fetchDispatched = true);
    let g = new Promise(d).then(a, w), A = Object.assign(g, { __abortController: o, __staleWhileFetching: n, __returned: void 0 });
    return e === void 0 ? (this.set(t, A, { ...r.options, status: void 0 }), e = this.#s.get(t)) : this.#t[e] = A, A;
  }
  #e(t) {
    if (!this.#v) return false;
    let e = t;
    return !!e && e instanceof Promise && e.hasOwnProperty("__staleWhileFetching") && e.__abortController instanceof C;
  }
  async fetch(t, e = {}) {
    let { allowStale: i = this.allowStale, updateAgeOnGet: s = this.updateAgeOnGet, noDeleteOnStaleGet: n = this.noDeleteOnStaleGet, ttl: o = this.ttl, noDisposeOnSet: h = this.noDisposeOnSet, size: r = 0, sizeCalculation: a = this.sizeCalculation, noUpdateTTL: w = this.noUpdateTTL, noDeleteOnFetchRejection: f = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection: d = this.allowStaleOnFetchRejection, ignoreFetchAbort: g = this.ignoreFetchAbort, allowStaleOnFetchAbort: A = this.allowStaleOnFetchAbort, context: p, forceRefresh: _ = false, status: l, signal: S } = e;
    if (!this.#v) return l && (l.fetch = "get"), this.get(t, { allowStale: i, updateAgeOnGet: s, noDeleteOnStaleGet: n, status: l });
    let b = { allowStale: i, updateAgeOnGet: s, noDeleteOnStaleGet: n, ttl: o, noDisposeOnSet: h, size: r, sizeCalculation: a, noUpdateTTL: w, noDeleteOnFetchRejection: f, allowStaleOnFetchRejection: d, allowStaleOnFetchAbort: A, ignoreFetchAbort: g, status: l, signal: S }, m = this.#s.get(t);
    if (m === void 0) {
      l && (l.fetch = "miss");
      let u = this.#G(t, m, b, p);
      return u.__returned = u;
    } else {
      let u = this.#t[m];
      if (this.#e(u)) {
        let E = i && u.__staleWhileFetching !== void 0;
        return l && (l.fetch = "inflight", E && (l.returnedStale = true)), E ? u.__staleWhileFetching : u.__returned = u;
      }
      let T = this.#p(m);
      if (!_ && !T) return l && (l.fetch = "hit"), this.#D(m), s && this.#R(m), l && this.#z(l, m), u;
      let F = this.#G(t, m, b, p), O = F.__staleWhileFetching !== void 0 && i;
      return l && (l.fetch = T ? "stale" : "refresh", O && T && (l.returnedStale = true)), O ? F.__staleWhileFetching : F.__returned = F;
    }
  }
  async forceFetch(t, e = {}) {
    let i = await this.fetch(t, e);
    if (i === void 0) throw new Error("fetch() returned undefined");
    return i;
  }
  memo(t, e = {}) {
    let i = this.#I;
    if (!i) throw new Error("no memoMethod provided to constructor");
    let { context: s, forceRefresh: n, ...o } = e, h = this.get(t, o);
    if (!n && h !== void 0) return h;
    let r = i(t, h, { options: o, context: s });
    return this.set(t, r, o), r;
  }
  get(t, e = {}) {
    let { allowStale: i = this.allowStale, updateAgeOnGet: s = this.updateAgeOnGet, noDeleteOnStaleGet: n = this.noDeleteOnStaleGet, status: o } = e, h = this.#s.get(t);
    if (h !== void 0) {
      let r = this.#t[h], a = this.#e(r);
      return o && this.#z(o, h), this.#p(h) ? (o && (o.get = "stale"), a ? (o && i && r.__staleWhileFetching !== void 0 && (o.returnedStale = true), i ? r.__staleWhileFetching : void 0) : (n || this.#E(t, "expire"), o && i && (o.returnedStale = true), i ? r : void 0)) : (o && (o.get = "hit"), a ? r.__staleWhileFetching : (this.#D(h), s && this.#R(h), r));
    } else o && (o.get = "miss");
  }
  #k(t, e) {
    this.#u[e] = t, this.#a[t] = e;
  }
  #D(t) {
    t !== this.#h && (t === this.#l ? this.#l = this.#a[t] : this.#k(this.#u[t], this.#a[t]), this.#k(this.#h, t), this.#h = t);
  }
  delete(t) {
    return this.#E(t, "delete");
  }
  #E(t, e) {
    let i = false;
    if (this.#n !== 0) {
      let s = this.#s.get(t);
      if (s !== void 0) if (this.#g?.[s] && (clearTimeout(this.#g?.[s]), this.#g[s] = void 0), i = true, this.#n === 1) this.#V(e);
      else {
        this.#W(s);
        let n = this.#t[s];
        if (this.#e(n) ? n.__abortController.abort(new Error("deleted")) : (this.#T || this.#f) && (this.#T && this.#w?.(n, t, e), this.#f && this.#r?.push([n, t, e])), this.#s.delete(t), this.#i[s] = void 0, this.#t[s] = void 0, s === this.#h) this.#h = this.#u[s];
        else if (s === this.#l) this.#l = this.#a[s];
        else {
          let o = this.#u[s];
          this.#a[o] = this.#a[s];
          let h = this.#a[s];
          this.#u[h] = this.#u[s];
        }
        this.#n--, this.#b.push(s);
      }
    }
    if (this.#f && this.#r?.length) {
      let s = this.#r, n;
      for (; n = s?.shift(); ) this.#S?.(...n);
    }
    return i;
  }
  clear() {
    return this.#V("delete");
  }
  #V(t) {
    for (let e of this.#O({ allowStale: true })) {
      let i = this.#t[e];
      if (this.#e(i)) i.__abortController.abort(new Error("deleted"));
      else {
        let s = this.#i[e];
        this.#T && this.#w?.(i, s, t), this.#f && this.#r?.push([i, s, t]);
      }
    }
    if (this.#s.clear(), this.#t.fill(void 0), this.#i.fill(void 0), this.#d && this.#A) {
      this.#d.fill(0), this.#A.fill(0);
      for (let e of this.#g ?? []) e !== void 0 && clearTimeout(e);
      this.#g?.fill(void 0);
    }
    if (this.#y && this.#y.fill(0), this.#l = 0, this.#h = 0, this.#b.length = 0, this.#_ = 0, this.#n = 0, this.#f && this.#r) {
      let e = this.#r, i;
      for (; i = e?.shift(); ) this.#S?.(...i);
    }
  }
};

// node_modules/path-scurry/dist/esm/index.js
import { posix, win32 } from "path";
import { fileURLToPath } from "url";
import { lstatSync, readdir as readdirCB, readdirSync, readlinkSync, realpathSync as rps } from "fs";
import * as actualFS from "fs";
import { lstat, readdir, readlink, realpath } from "fs/promises";

// node_modules/minipass/dist/esm/index.js
import { EventEmitter } from "events";
import Stream from "stream";
import { StringDecoder } from "string_decoder";
var proc = typeof process === "object" && process ? process : {
  stdout: null,
  stderr: null
};
var isStream = (s) => !!s && typeof s === "object" && (s instanceof Minipass || s instanceof Stream || isReadable(s) || isWritable(s));
var isReadable = (s) => !!s && typeof s === "object" && s instanceof EventEmitter && typeof s.pipe === "function" && // node core Writable streams have a pipe() method, but it throws
s.pipe !== Stream.Writable.prototype.pipe;
var isWritable = (s) => !!s && typeof s === "object" && s instanceof EventEmitter && typeof s.write === "function" && typeof s.end === "function";
var EOF = /* @__PURE__ */ Symbol("EOF");
var MAYBE_EMIT_END = /* @__PURE__ */ Symbol("maybeEmitEnd");
var EMITTED_END = /* @__PURE__ */ Symbol("emittedEnd");
var EMITTING_END = /* @__PURE__ */ Symbol("emittingEnd");
var EMITTED_ERROR = /* @__PURE__ */ Symbol("emittedError");
var CLOSED = /* @__PURE__ */ Symbol("closed");
var READ = /* @__PURE__ */ Symbol("read");
var FLUSH = /* @__PURE__ */ Symbol("flush");
var FLUSHCHUNK = /* @__PURE__ */ Symbol("flushChunk");
var ENCODING = /* @__PURE__ */ Symbol("encoding");
var DECODER = /* @__PURE__ */ Symbol("decoder");
var FLOWING = /* @__PURE__ */ Symbol("flowing");
var PAUSED = /* @__PURE__ */ Symbol("paused");
var RESUME = /* @__PURE__ */ Symbol("resume");
var BUFFER = /* @__PURE__ */ Symbol("buffer");
var PIPES = /* @__PURE__ */ Symbol("pipes");
var BUFFERLENGTH = /* @__PURE__ */ Symbol("bufferLength");
var BUFFERPUSH = /* @__PURE__ */ Symbol("bufferPush");
var BUFFERSHIFT = /* @__PURE__ */ Symbol("bufferShift");
var OBJECTMODE = /* @__PURE__ */ Symbol("objectMode");
var DESTROYED = /* @__PURE__ */ Symbol("destroyed");
var ERROR = /* @__PURE__ */ Symbol("error");
var EMITDATA = /* @__PURE__ */ Symbol("emitData");
var EMITEND = /* @__PURE__ */ Symbol("emitEnd");
var EMITEND2 = /* @__PURE__ */ Symbol("emitEnd2");
var ASYNC = /* @__PURE__ */ Symbol("async");
var ABORT = /* @__PURE__ */ Symbol("abort");
var ABORTED = /* @__PURE__ */ Symbol("aborted");
var SIGNAL = /* @__PURE__ */ Symbol("signal");
var DATALISTENERS = /* @__PURE__ */ Symbol("dataListeners");
var DISCARDED = /* @__PURE__ */ Symbol("discarded");
var defer = (fn) => Promise.resolve().then(fn);
var nodefer = (fn) => fn();
var isEndish = (ev) => ev === "end" || ev === "finish" || ev === "prefinish";
var isArrayBufferLike = (b) => b instanceof ArrayBuffer || !!b && typeof b === "object" && b.constructor && b.constructor.name === "ArrayBuffer" && b.byteLength >= 0;
var isArrayBufferView = (b) => !Buffer.isBuffer(b) && ArrayBuffer.isView(b);
var Pipe = class {
  src;
  dest;
  opts;
  ondrain;
  constructor(src, dest, opts) {
    this.src = src;
    this.dest = dest;
    this.opts = opts;
    this.ondrain = () => src[RESUME]();
    this.dest.on("drain", this.ondrain);
  }
  unpipe() {
    this.dest.removeListener("drain", this.ondrain);
  }
  // only here for the prototype
  /* c8 ignore start */
  proxyErrors(_er) {
  }
  /* c8 ignore stop */
  end() {
    this.unpipe();
    if (this.opts.end)
      this.dest.end();
  }
};
var PipeProxyErrors = class extends Pipe {
  unpipe() {
    this.src.removeListener("error", this.proxyErrors);
    super.unpipe();
  }
  constructor(src, dest, opts) {
    super(src, dest, opts);
    this.proxyErrors = (er) => this.dest.emit("error", er);
    src.on("error", this.proxyErrors);
  }
};
var isObjectModeOptions = (o) => !!o.objectMode;
var isEncodingOptions = (o) => !o.objectMode && !!o.encoding && o.encoding !== "buffer";
var Minipass = class extends EventEmitter {
  [FLOWING] = false;
  [PAUSED] = false;
  [PIPES] = [];
  [BUFFER] = [];
  [OBJECTMODE];
  [ENCODING];
  [ASYNC];
  [DECODER];
  [EOF] = false;
  [EMITTED_END] = false;
  [EMITTING_END] = false;
  [CLOSED] = false;
  [EMITTED_ERROR] = null;
  [BUFFERLENGTH] = 0;
  [DESTROYED] = false;
  [SIGNAL];
  [ABORTED] = false;
  [DATALISTENERS] = 0;
  [DISCARDED] = false;
  /**
   * true if the stream can be written
   */
  writable = true;
  /**
   * true if the stream can be read
   */
  readable = true;
  /**
   * If `RType` is Buffer, then options do not need to be provided.
   * Otherwise, an options object must be provided to specify either
   * {@link Minipass.SharedOptions.objectMode} or
   * {@link Minipass.SharedOptions.encoding}, as appropriate.
   */
  constructor(...args) {
    const options = args[0] || {};
    super();
    if (options.objectMode && typeof options.encoding === "string") {
      throw new TypeError("Encoding and objectMode may not be used together");
    }
    if (isObjectModeOptions(options)) {
      this[OBJECTMODE] = true;
      this[ENCODING] = null;
    } else if (isEncodingOptions(options)) {
      this[ENCODING] = options.encoding;
      this[OBJECTMODE] = false;
    } else {
      this[OBJECTMODE] = false;
      this[ENCODING] = null;
    }
    this[ASYNC] = !!options.async;
    this[DECODER] = this[ENCODING] ? new StringDecoder(this[ENCODING]) : null;
    if (options && options.debugExposeBuffer === true) {
      Object.defineProperty(this, "buffer", { get: () => this[BUFFER] });
    }
    if (options && options.debugExposePipes === true) {
      Object.defineProperty(this, "pipes", { get: () => this[PIPES] });
    }
    const { signal } = options;
    if (signal) {
      this[SIGNAL] = signal;
      if (signal.aborted) {
        this[ABORT]();
      } else {
        signal.addEventListener("abort", () => this[ABORT]());
      }
    }
  }
  /**
   * The amount of data stored in the buffer waiting to be read.
   *
   * For Buffer strings, this will be the total byte length.
   * For string encoding streams, this will be the string character length,
   * according to JavaScript's `string.length` logic.
   * For objectMode streams, this is a count of the items waiting to be
   * emitted.
   */
  get bufferLength() {
    return this[BUFFERLENGTH];
  }
  /**
   * The `BufferEncoding` currently in use, or `null`
   */
  get encoding() {
    return this[ENCODING];
  }
  /**
   * @deprecated - This is a read only property
   */
  set encoding(_enc) {
    throw new Error("Encoding must be set at instantiation time");
  }
  /**
   * @deprecated - Encoding may only be set at instantiation time
   */
  setEncoding(_enc) {
    throw new Error("Encoding must be set at instantiation time");
  }
  /**
   * True if this is an objectMode stream
   */
  get objectMode() {
    return this[OBJECTMODE];
  }
  /**
   * @deprecated - This is a read-only property
   */
  set objectMode(_om) {
    throw new Error("objectMode must be set at instantiation time");
  }
  /**
   * true if this is an async stream
   */
  get ["async"]() {
    return this[ASYNC];
  }
  /**
   * Set to true to make this stream async.
   *
   * Once set, it cannot be unset, as this would potentially cause incorrect
   * behavior.  Ie, a sync stream can be made async, but an async stream
   * cannot be safely made sync.
   */
  set ["async"](a) {
    this[ASYNC] = this[ASYNC] || !!a;
  }
  // drop everything and get out of the flow completely
  [ABORT]() {
    this[ABORTED] = true;
    this.emit("abort", this[SIGNAL]?.reason);
    this.destroy(this[SIGNAL]?.reason);
  }
  /**
   * True if the stream has been aborted.
   */
  get aborted() {
    return this[ABORTED];
  }
  /**
   * No-op setter. Stream aborted status is set via the AbortSignal provided
   * in the constructor options.
   */
  set aborted(_) {
  }
  write(chunk, encoding, cb) {
    if (this[ABORTED])
      return false;
    if (this[EOF])
      throw new Error("write after end");
    if (this[DESTROYED]) {
      this.emit("error", Object.assign(new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" }));
      return true;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = "utf8";
    }
    if (!encoding)
      encoding = "utf8";
    const fn = this[ASYNC] ? defer : nodefer;
    if (!this[OBJECTMODE] && !Buffer.isBuffer(chunk)) {
      if (isArrayBufferView(chunk)) {
        chunk = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      } else if (isArrayBufferLike(chunk)) {
        chunk = Buffer.from(chunk);
      } else if (typeof chunk !== "string") {
        throw new Error("Non-contiguous data written to non-objectMode stream");
      }
    }
    if (this[OBJECTMODE]) {
      if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
        this[FLUSH](true);
      if (this[FLOWING])
        this.emit("data", chunk);
      else
        this[BUFFERPUSH](chunk);
      if (this[BUFFERLENGTH] !== 0)
        this.emit("readable");
      if (cb)
        fn(cb);
      return this[FLOWING];
    }
    if (!chunk.length) {
      if (this[BUFFERLENGTH] !== 0)
        this.emit("readable");
      if (cb)
        fn(cb);
      return this[FLOWING];
    }
    if (typeof chunk === "string" && // unless it is a string already ready for us to use
    !(encoding === this[ENCODING] && !this[DECODER]?.lastNeed)) {
      chunk = Buffer.from(chunk, encoding);
    }
    if (Buffer.isBuffer(chunk) && this[ENCODING]) {
      chunk = this[DECODER].write(chunk);
    }
    if (this[FLOWING] && this[BUFFERLENGTH] !== 0)
      this[FLUSH](true);
    if (this[FLOWING])
      this.emit("data", chunk);
    else
      this[BUFFERPUSH](chunk);
    if (this[BUFFERLENGTH] !== 0)
      this.emit("readable");
    if (cb)
      fn(cb);
    return this[FLOWING];
  }
  /**
   * Low-level explicit read method.
   *
   * In objectMode, the argument is ignored, and one item is returned if
   * available.
   *
   * `n` is the number of bytes (or in the case of encoding streams,
   * characters) to consume. If `n` is not provided, then the entire buffer
   * is returned, or `null` is returned if no data is available.
   *
   * If `n` is greater that the amount of data in the internal buffer,
   * then `null` is returned.
   */
  read(n) {
    if (this[DESTROYED])
      return null;
    this[DISCARDED] = false;
    if (this[BUFFERLENGTH] === 0 || n === 0 || n && n > this[BUFFERLENGTH]) {
      this[MAYBE_EMIT_END]();
      return null;
    }
    if (this[OBJECTMODE])
      n = null;
    if (this[BUFFER].length > 1 && !this[OBJECTMODE]) {
      this[BUFFER] = [
        this[ENCODING] ? this[BUFFER].join("") : Buffer.concat(this[BUFFER], this[BUFFERLENGTH])
      ];
    }
    const ret = this[READ](n || null, this[BUFFER][0]);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [READ](n, chunk) {
    if (this[OBJECTMODE])
      this[BUFFERSHIFT]();
    else {
      const c3 = chunk;
      if (n === c3.length || n === null)
        this[BUFFERSHIFT]();
      else if (typeof c3 === "string") {
        this[BUFFER][0] = c3.slice(n);
        chunk = c3.slice(0, n);
        this[BUFFERLENGTH] -= n;
      } else {
        this[BUFFER][0] = c3.subarray(n);
        chunk = c3.subarray(0, n);
        this[BUFFERLENGTH] -= n;
      }
    }
    this.emit("data", chunk);
    if (!this[BUFFER].length && !this[EOF])
      this.emit("drain");
    return chunk;
  }
  end(chunk, encoding, cb) {
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = void 0;
    }
    if (typeof encoding === "function") {
      cb = encoding;
      encoding = "utf8";
    }
    if (chunk !== void 0)
      this.write(chunk, encoding);
    if (cb)
      this.once("end", cb);
    this[EOF] = true;
    this.writable = false;
    if (this[FLOWING] || !this[PAUSED])
      this[MAYBE_EMIT_END]();
    return this;
  }
  // don't let the internal resume be overwritten
  [RESUME]() {
    if (this[DESTROYED])
      return;
    if (!this[DATALISTENERS] && !this[PIPES].length) {
      this[DISCARDED] = true;
    }
    this[PAUSED] = false;
    this[FLOWING] = true;
    this.emit("resume");
    if (this[BUFFER].length)
      this[FLUSH]();
    else if (this[EOF])
      this[MAYBE_EMIT_END]();
    else
      this.emit("drain");
  }
  /**
   * Resume the stream if it is currently in a paused state
   *
   * If called when there are no pipe destinations or `data` event listeners,
   * this will place the stream in a "discarded" state, where all data will
   * be thrown away. The discarded state is removed if a pipe destination or
   * data handler is added, if pause() is called, or if any synchronous or
   * asynchronous iteration is started.
   */
  resume() {
    return this[RESUME]();
  }
  /**
   * Pause the stream
   */
  pause() {
    this[FLOWING] = false;
    this[PAUSED] = true;
    this[DISCARDED] = false;
  }
  /**
   * true if the stream has been forcibly destroyed
   */
  get destroyed() {
    return this[DESTROYED];
  }
  /**
   * true if the stream is currently in a flowing state, meaning that
   * any writes will be immediately emitted.
   */
  get flowing() {
    return this[FLOWING];
  }
  /**
   * true if the stream is currently in a paused state
   */
  get paused() {
    return this[PAUSED];
  }
  [BUFFERPUSH](chunk) {
    if (this[OBJECTMODE])
      this[BUFFERLENGTH] += 1;
    else
      this[BUFFERLENGTH] += chunk.length;
    this[BUFFER].push(chunk);
  }
  [BUFFERSHIFT]() {
    if (this[OBJECTMODE])
      this[BUFFERLENGTH] -= 1;
    else
      this[BUFFERLENGTH] -= this[BUFFER][0].length;
    return this[BUFFER].shift();
  }
  [FLUSH](noDrain = false) {
    do {
    } while (this[FLUSHCHUNK](this[BUFFERSHIFT]()) && this[BUFFER].length);
    if (!noDrain && !this[BUFFER].length && !this[EOF])
      this.emit("drain");
  }
  [FLUSHCHUNK](chunk) {
    this.emit("data", chunk);
    return this[FLOWING];
  }
  /**
   * Pipe all data emitted by this stream into the destination provided.
   *
   * Triggers the flow of data.
   */
  pipe(dest, opts) {
    if (this[DESTROYED])
      return dest;
    this[DISCARDED] = false;
    const ended = this[EMITTED_END];
    opts = opts || {};
    if (dest === proc.stdout || dest === proc.stderr)
      opts.end = false;
    else
      opts.end = opts.end !== false;
    opts.proxyErrors = !!opts.proxyErrors;
    if (ended) {
      if (opts.end)
        dest.end();
    } else {
      this[PIPES].push(!opts.proxyErrors ? new Pipe(this, dest, opts) : new PipeProxyErrors(this, dest, opts));
      if (this[ASYNC])
        defer(() => this[RESUME]());
      else
        this[RESUME]();
    }
    return dest;
  }
  /**
   * Fully unhook a piped destination stream.
   *
   * If the destination stream was the only consumer of this stream (ie,
   * there are no other piped destinations or `'data'` event listeners)
   * then the flow of data will stop until there is another consumer or
   * {@link Minipass#resume} is explicitly called.
   */
  unpipe(dest) {
    const p = this[PIPES].find((p2) => p2.dest === dest);
    if (p) {
      if (this[PIPES].length === 1) {
        if (this[FLOWING] && this[DATALISTENERS] === 0) {
          this[FLOWING] = false;
        }
        this[PIPES] = [];
      } else
        this[PIPES].splice(this[PIPES].indexOf(p), 1);
      p.unpipe();
    }
  }
  /**
   * Alias for {@link Minipass#on}
   */
  addListener(ev, handler) {
    return this.on(ev, handler);
  }
  /**
   * Mostly identical to `EventEmitter.on`, with the following
   * behavior differences to prevent data loss and unnecessary hangs:
   *
   * - Adding a 'data' event handler will trigger the flow of data
   *
   * - Adding a 'readable' event handler when there is data waiting to be read
   *   will cause 'readable' to be emitted immediately.
   *
   * - Adding an 'endish' event handler ('end', 'finish', etc.) which has
   *   already passed will cause the event to be emitted immediately and all
   *   handlers removed.
   *
   * - Adding an 'error' event handler after an error has been emitted will
   *   cause the event to be re-emitted immediately with the error previously
   *   raised.
   */
  on(ev, handler) {
    const ret = super.on(ev, handler);
    if (ev === "data") {
      this[DISCARDED] = false;
      this[DATALISTENERS]++;
      if (!this[PIPES].length && !this[FLOWING]) {
        this[RESUME]();
      }
    } else if (ev === "readable" && this[BUFFERLENGTH] !== 0) {
      super.emit("readable");
    } else if (isEndish(ev) && this[EMITTED_END]) {
      super.emit(ev);
      this.removeAllListeners(ev);
    } else if (ev === "error" && this[EMITTED_ERROR]) {
      const h = handler;
      if (this[ASYNC])
        defer(() => h.call(this, this[EMITTED_ERROR]));
      else
        h.call(this, this[EMITTED_ERROR]);
    }
    return ret;
  }
  /**
   * Alias for {@link Minipass#off}
   */
  removeListener(ev, handler) {
    return this.off(ev, handler);
  }
  /**
   * Mostly identical to `EventEmitter.off`
   *
   * If a 'data' event handler is removed, and it was the last consumer
   * (ie, there are no pipe destinations or other 'data' event listeners),
   * then the flow of data will stop until there is another consumer or
   * {@link Minipass#resume} is explicitly called.
   */
  off(ev, handler) {
    const ret = super.off(ev, handler);
    if (ev === "data") {
      this[DATALISTENERS] = this.listeners("data").length;
      if (this[DATALISTENERS] === 0 && !this[DISCARDED] && !this[PIPES].length) {
        this[FLOWING] = false;
      }
    }
    return ret;
  }
  /**
   * Mostly identical to `EventEmitter.removeAllListeners`
   *
   * If all 'data' event handlers are removed, and they were the last consumer
   * (ie, there are no pipe destinations), then the flow of data will stop
   * until there is another consumer or {@link Minipass#resume} is explicitly
   * called.
   */
  removeAllListeners(ev) {
    const ret = super.removeAllListeners(ev);
    if (ev === "data" || ev === void 0) {
      this[DATALISTENERS] = 0;
      if (!this[DISCARDED] && !this[PIPES].length) {
        this[FLOWING] = false;
      }
    }
    return ret;
  }
  /**
   * true if the 'end' event has been emitted
   */
  get emittedEnd() {
    return this[EMITTED_END];
  }
  [MAYBE_EMIT_END]() {
    if (!this[EMITTING_END] && !this[EMITTED_END] && !this[DESTROYED] && this[BUFFER].length === 0 && this[EOF]) {
      this[EMITTING_END] = true;
      this.emit("end");
      this.emit("prefinish");
      this.emit("finish");
      if (this[CLOSED])
        this.emit("close");
      this[EMITTING_END] = false;
    }
  }
  /**
   * Mostly identical to `EventEmitter.emit`, with the following
   * behavior differences to prevent data loss and unnecessary hangs:
   *
   * If the stream has been destroyed, and the event is something other
   * than 'close' or 'error', then `false` is returned and no handlers
   * are called.
   *
   * If the event is 'end', and has already been emitted, then the event
   * is ignored. If the stream is in a paused or non-flowing state, then
   * the event will be deferred until data flow resumes. If the stream is
   * async, then handlers will be called on the next tick rather than
   * immediately.
   *
   * If the event is 'close', and 'end' has not yet been emitted, then
   * the event will be deferred until after 'end' is emitted.
   *
   * If the event is 'error', and an AbortSignal was provided for the stream,
   * and there are no listeners, then the event is ignored, matching the
   * behavior of node core streams in the presense of an AbortSignal.
   *
   * If the event is 'finish' or 'prefinish', then all listeners will be
   * removed after emitting the event, to prevent double-firing.
   */
  emit(ev, ...args) {
    const data = args[0];
    if (ev !== "error" && ev !== "close" && ev !== DESTROYED && this[DESTROYED]) {
      return false;
    } else if (ev === "data") {
      return !this[OBJECTMODE] && !data ? false : this[ASYNC] ? (defer(() => this[EMITDATA](data)), true) : this[EMITDATA](data);
    } else if (ev === "end") {
      return this[EMITEND]();
    } else if (ev === "close") {
      this[CLOSED] = true;
      if (!this[EMITTED_END] && !this[DESTROYED])
        return false;
      const ret2 = super.emit("close");
      this.removeAllListeners("close");
      return ret2;
    } else if (ev === "error") {
      this[EMITTED_ERROR] = data;
      super.emit(ERROR, data);
      const ret2 = !this[SIGNAL] || this.listeners("error").length ? super.emit("error", data) : false;
      this[MAYBE_EMIT_END]();
      return ret2;
    } else if (ev === "resume") {
      const ret2 = super.emit("resume");
      this[MAYBE_EMIT_END]();
      return ret2;
    } else if (ev === "finish" || ev === "prefinish") {
      const ret2 = super.emit(ev);
      this.removeAllListeners(ev);
      return ret2;
    }
    const ret = super.emit(ev, ...args);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [EMITDATA](data) {
    for (const p of this[PIPES]) {
      if (p.dest.write(data) === false)
        this.pause();
    }
    const ret = this[DISCARDED] ? false : super.emit("data", data);
    this[MAYBE_EMIT_END]();
    return ret;
  }
  [EMITEND]() {
    if (this[EMITTED_END])
      return false;
    this[EMITTED_END] = true;
    this.readable = false;
    return this[ASYNC] ? (defer(() => this[EMITEND2]()), true) : this[EMITEND2]();
  }
  [EMITEND2]() {
    if (this[DECODER]) {
      const data = this[DECODER].end();
      if (data) {
        for (const p of this[PIPES]) {
          p.dest.write(data);
        }
        if (!this[DISCARDED])
          super.emit("data", data);
      }
    }
    for (const p of this[PIPES]) {
      p.end();
    }
    const ret = super.emit("end");
    this.removeAllListeners("end");
    return ret;
  }
  /**
   * Return a Promise that resolves to an array of all emitted data once
   * the stream ends.
   */
  async collect() {
    const buf = Object.assign([], {
      dataLength: 0
    });
    if (!this[OBJECTMODE])
      buf.dataLength = 0;
    const p = this.promise();
    this.on("data", (c3) => {
      buf.push(c3);
      if (!this[OBJECTMODE])
        buf.dataLength += c3.length;
    });
    await p;
    return buf;
  }
  /**
   * Return a Promise that resolves to the concatenation of all emitted data
   * once the stream ends.
   *
   * Not allowed on objectMode streams.
   */
  async concat() {
    if (this[OBJECTMODE]) {
      throw new Error("cannot concat in objectMode");
    }
    const buf = await this.collect();
    return this[ENCODING] ? buf.join("") : Buffer.concat(buf, buf.dataLength);
  }
  /**
   * Return a void Promise that resolves once the stream ends.
   */
  async promise() {
    return new Promise((resolve4, reject) => {
      this.on(DESTROYED, () => reject(new Error("stream destroyed")));
      this.on("error", (er) => reject(er));
      this.on("end", () => resolve4());
    });
  }
  /**
   * Asynchronous `for await of` iteration.
   *
   * This will continue emitting all chunks until the stream terminates.
   */
  [Symbol.asyncIterator]() {
    this[DISCARDED] = false;
    let stopped = false;
    const stop = async () => {
      this.pause();
      stopped = true;
      return { value: void 0, done: true };
    };
    const next = () => {
      if (stopped)
        return stop();
      const res = this.read();
      if (res !== null)
        return Promise.resolve({ done: false, value: res });
      if (this[EOF])
        return stop();
      let resolve4;
      let reject;
      const onerr = (er) => {
        this.off("data", ondata);
        this.off("end", onend);
        this.off(DESTROYED, ondestroy);
        stop();
        reject(er);
      };
      const ondata = (value) => {
        this.off("error", onerr);
        this.off("end", onend);
        this.off(DESTROYED, ondestroy);
        this.pause();
        resolve4({ value, done: !!this[EOF] });
      };
      const onend = () => {
        this.off("error", onerr);
        this.off("data", ondata);
        this.off(DESTROYED, ondestroy);
        stop();
        resolve4({ done: true, value: void 0 });
      };
      const ondestroy = () => onerr(new Error("stream destroyed"));
      return new Promise((res2, rej) => {
        reject = rej;
        resolve4 = res2;
        this.once(DESTROYED, ondestroy);
        this.once("error", onerr);
        this.once("end", onend);
        this.once("data", ondata);
      });
    };
    return {
      next,
      throw: stop,
      return: stop,
      [Symbol.asyncIterator]() {
        return this;
      },
      [Symbol.asyncDispose]: async () => {
      }
    };
  }
  /**
   * Synchronous `for of` iteration.
   *
   * The iteration will terminate when the internal buffer runs out, even
   * if the stream has not yet terminated.
   */
  [Symbol.iterator]() {
    this[DISCARDED] = false;
    let stopped = false;
    const stop = () => {
      this.pause();
      this.off(ERROR, stop);
      this.off(DESTROYED, stop);
      this.off("end", stop);
      stopped = true;
      return { done: true, value: void 0 };
    };
    const next = () => {
      if (stopped)
        return stop();
      const value = this.read();
      return value === null ? stop() : { done: false, value };
    };
    this.once("end", stop);
    this.once(ERROR, stop);
    this.once(DESTROYED, stop);
    return {
      next,
      throw: stop,
      return: stop,
      [Symbol.iterator]() {
        return this;
      },
      [Symbol.dispose]: () => {
      }
    };
  }
  /**
   * Destroy a stream, preventing it from being used for any further purpose.
   *
   * If the stream has a `close()` method, then it will be called on
   * destruction.
   *
   * After destruction, any attempt to write data, read data, or emit most
   * events will be ignored.
   *
   * If an error argument is provided, then it will be emitted in an
   * 'error' event.
   */
  destroy(er) {
    if (this[DESTROYED]) {
      if (er)
        this.emit("error", er);
      else
        this.emit(DESTROYED);
      return this;
    }
    this[DESTROYED] = true;
    this[DISCARDED] = true;
    this[BUFFER].length = 0;
    this[BUFFERLENGTH] = 0;
    const wc = this;
    if (typeof wc.close === "function" && !this[CLOSED])
      wc.close();
    if (er)
      this.emit("error", er);
    else
      this.emit(DESTROYED);
    return this;
  }
  /**
   * Alias for {@link isStream}
   *
   * Former export location, maintained for backwards compatibility.
   *
   * @deprecated
   */
  static get isStream() {
    return isStream;
  }
};

// node_modules/path-scurry/dist/esm/index.js
var realpathSync = rps.native;
var defaultFS = {
  lstatSync,
  readdir: readdirCB,
  readdirSync,
  readlinkSync,
  realpathSync,
  promises: {
    lstat,
    readdir,
    readlink,
    realpath
  }
};
var fsFromOption = (fsOption) => !fsOption || fsOption === defaultFS || fsOption === actualFS ? defaultFS : {
  ...defaultFS,
  ...fsOption,
  promises: {
    ...defaultFS.promises,
    ...fsOption.promises || {}
  }
};
var uncDriveRegexp = /^\\\\\?\\([a-z]:)\\?$/i;
var uncToDrive = (rootPath) => rootPath.replace(/\//g, "\\").replace(uncDriveRegexp, "$1\\");
var eitherSep = /[\\\/]/;
var UNKNOWN = 0;
var IFIFO = 1;
var IFCHR = 2;
var IFDIR = 4;
var IFBLK = 6;
var IFREG = 8;
var IFLNK = 10;
var IFSOCK = 12;
var IFMT = 15;
var IFMT_UNKNOWN = ~IFMT;
var READDIR_CALLED = 16;
var LSTAT_CALLED = 32;
var ENOTDIR = 64;
var ENOENT = 128;
var ENOREADLINK = 256;
var ENOREALPATH = 512;
var ENOCHILD = ENOTDIR | ENOENT | ENOREALPATH;
var TYPEMASK = 1023;
var entToType = (s) => s.isFile() ? IFREG : s.isDirectory() ? IFDIR : s.isSymbolicLink() ? IFLNK : s.isCharacterDevice() ? IFCHR : s.isBlockDevice() ? IFBLK : s.isSocket() ? IFSOCK : s.isFIFO() ? IFIFO : UNKNOWN;
var normalizeCache = new L({ max: 2 ** 12 });
var normalize = (s) => {
  const c3 = normalizeCache.get(s);
  if (c3)
    return c3;
  const n = s.normalize("NFKD");
  normalizeCache.set(s, n);
  return n;
};
var normalizeNocaseCache = new L({ max: 2 ** 12 });
var normalizeNocase = (s) => {
  const c3 = normalizeNocaseCache.get(s);
  if (c3)
    return c3;
  const n = normalize(s.toLowerCase());
  normalizeNocaseCache.set(s, n);
  return n;
};
var ResolveCache = class extends L {
  constructor() {
    super({ max: 256 });
  }
};
var ChildrenCache = class extends L {
  constructor(maxSize = 16 * 1024) {
    super({
      maxSize,
      // parent + children
      sizeCalculation: (a) => a.length + 1
    });
  }
};
var setAsCwd = /* @__PURE__ */ Symbol("PathScurry setAsCwd");
var PathBase = class {
  /**
   * the basename of this path
   *
   * **Important**: *always* test the path name against any test string
   * usingthe {@link isNamed} method, and not by directly comparing this
   * string. Otherwise, unicode path strings that the system sees as identical
   * will not be properly treated as the same path, leading to incorrect
   * behavior and possible security issues.
   */
  name;
  /**
   * the Path entry corresponding to the path root.
   *
   * @internal
   */
  root;
  /**
   * All roots found within the current PathScurry family
   *
   * @internal
   */
  roots;
  /**
   * a reference to the parent path, or undefined in the case of root entries
   *
   * @internal
   */
  parent;
  /**
   * boolean indicating whether paths are compared case-insensitively
   * @internal
   */
  nocase;
  /**
   * boolean indicating that this path is the current working directory
   * of the PathScurry collection that contains it.
   */
  isCWD = false;
  // potential default fs override
  #fs;
  // Stats fields
  #dev;
  get dev() {
    return this.#dev;
  }
  #mode;
  get mode() {
    return this.#mode;
  }
  #nlink;
  get nlink() {
    return this.#nlink;
  }
  #uid;
  get uid() {
    return this.#uid;
  }
  #gid;
  get gid() {
    return this.#gid;
  }
  #rdev;
  get rdev() {
    return this.#rdev;
  }
  #blksize;
  get blksize() {
    return this.#blksize;
  }
  #ino;
  get ino() {
    return this.#ino;
  }
  #size;
  get size() {
    return this.#size;
  }
  #blocks;
  get blocks() {
    return this.#blocks;
  }
  #atimeMs;
  get atimeMs() {
    return this.#atimeMs;
  }
  #mtimeMs;
  get mtimeMs() {
    return this.#mtimeMs;
  }
  #ctimeMs;
  get ctimeMs() {
    return this.#ctimeMs;
  }
  #birthtimeMs;
  get birthtimeMs() {
    return this.#birthtimeMs;
  }
  #atime;
  get atime() {
    return this.#atime;
  }
  #mtime;
  get mtime() {
    return this.#mtime;
  }
  #ctime;
  get ctime() {
    return this.#ctime;
  }
  #birthtime;
  get birthtime() {
    return this.#birthtime;
  }
  #matchName;
  #depth;
  #fullpath;
  #fullpathPosix;
  #relative;
  #relativePosix;
  #type;
  #children;
  #linkTarget;
  #realpath;
  /**
   * This property is for compatibility with the Dirent class as of
   * Node v20, where Dirent['parentPath'] refers to the path of the
   * directory that was passed to readdir. For root entries, it's the path
   * to the entry itself.
   */
  get parentPath() {
    return (this.parent || this).fullpath();
  }
  /* c8 ignore start */
  /**
   * Deprecated alias for Dirent['parentPath'] Somewhat counterintuitively,
   * this property refers to the *parent* path, not the path object itself.
   *
   * @deprecated
   */
  get path() {
    return this.parentPath;
  }
  /* c8 ignore stop */
  /**
   * Do not create new Path objects directly.  They should always be accessed
   * via the PathScurry class or other methods on the Path class.
   *
   * @internal
   */
  constructor(name, type = UNKNOWN, root, roots, nocase, children, opts) {
    this.name = name;
    this.#matchName = nocase ? normalizeNocase(name) : normalize(name);
    this.#type = type & TYPEMASK;
    this.nocase = nocase;
    this.roots = roots;
    this.root = root || this;
    this.#children = children;
    this.#fullpath = opts.fullpath;
    this.#relative = opts.relative;
    this.#relativePosix = opts.relativePosix;
    this.parent = opts.parent;
    if (this.parent) {
      this.#fs = this.parent.#fs;
    } else {
      this.#fs = fsFromOption(opts.fs);
    }
  }
  /**
   * Returns the depth of the Path object from its root.
   *
   * For example, a path at `/foo/bar` would have a depth of 2.
   */
  depth() {
    if (this.#depth !== void 0)
      return this.#depth;
    if (!this.parent)
      return this.#depth = 0;
    return this.#depth = this.parent.depth() + 1;
  }
  /**
   * @internal
   */
  childrenCache() {
    return this.#children;
  }
  /**
   * Get the Path object referenced by the string path, resolved from this Path
   */
  resolve(path2) {
    if (!path2) {
      return this;
    }
    const rootPath = this.getRootString(path2);
    const dir = path2.substring(rootPath.length);
    const dirParts = dir.split(this.splitSep);
    const result = rootPath ? this.getRoot(rootPath).#resolveParts(dirParts) : this.#resolveParts(dirParts);
    return result;
  }
  #resolveParts(dirParts) {
    let p = this;
    for (const part of dirParts) {
      p = p.child(part);
    }
    return p;
  }
  /**
   * Returns the cached children Path objects, if still available.  If they
   * have fallen out of the cache, then returns an empty array, and resets the
   * READDIR_CALLED bit, so that future calls to readdir() will require an fs
   * lookup.
   *
   * @internal
   */
  children() {
    const cached = this.#children.get(this);
    if (cached) {
      return cached;
    }
    const children = Object.assign([], { provisional: 0 });
    this.#children.set(this, children);
    this.#type &= ~READDIR_CALLED;
    return children;
  }
  /**
   * Resolves a path portion and returns or creates the child Path.
   *
   * Returns `this` if pathPart is `''` or `'.'`, or `parent` if pathPart is
   * `'..'`.
   *
   * This should not be called directly.  If `pathPart` contains any path
   * separators, it will lead to unsafe undefined behavior.
   *
   * Use `Path.resolve()` instead.
   *
   * @internal
   */
  child(pathPart, opts) {
    if (pathPart === "" || pathPart === ".") {
      return this;
    }
    if (pathPart === "..") {
      return this.parent || this;
    }
    const children = this.children();
    const name = this.nocase ? normalizeNocase(pathPart) : normalize(pathPart);
    for (const p of children) {
      if (p.#matchName === name) {
        return p;
      }
    }
    const s = this.parent ? this.sep : "";
    const fullpath = this.#fullpath ? this.#fullpath + s + pathPart : void 0;
    const pchild = this.newChild(pathPart, UNKNOWN, {
      ...opts,
      parent: this,
      fullpath
    });
    if (!this.canReaddir()) {
      pchild.#type |= ENOENT;
    }
    children.push(pchild);
    return pchild;
  }
  /**
   * The relative path from the cwd. If it does not share an ancestor with
   * the cwd, then this ends up being equivalent to the fullpath()
   */
  relative() {
    if (this.isCWD)
      return "";
    if (this.#relative !== void 0) {
      return this.#relative;
    }
    const name = this.name;
    const p = this.parent;
    if (!p) {
      return this.#relative = this.name;
    }
    const pv = p.relative();
    return pv + (!pv || !p.parent ? "" : this.sep) + name;
  }
  /**
   * The relative path from the cwd, using / as the path separator.
   * If it does not share an ancestor with
   * the cwd, then this ends up being equivalent to the fullpathPosix()
   * On posix systems, this is identical to relative().
   */
  relativePosix() {
    if (this.sep === "/")
      return this.relative();
    if (this.isCWD)
      return "";
    if (this.#relativePosix !== void 0)
      return this.#relativePosix;
    const name = this.name;
    const p = this.parent;
    if (!p) {
      return this.#relativePosix = this.fullpathPosix();
    }
    const pv = p.relativePosix();
    return pv + (!pv || !p.parent ? "" : "/") + name;
  }
  /**
   * The fully resolved path string for this Path entry
   */
  fullpath() {
    if (this.#fullpath !== void 0) {
      return this.#fullpath;
    }
    const name = this.name;
    const p = this.parent;
    if (!p) {
      return this.#fullpath = this.name;
    }
    const pv = p.fullpath();
    const fp = pv + (!p.parent ? "" : this.sep) + name;
    return this.#fullpath = fp;
  }
  /**
   * On platforms other than windows, this is identical to fullpath.
   *
   * On windows, this is overridden to return the forward-slash form of the
   * full UNC path.
   */
  fullpathPosix() {
    if (this.#fullpathPosix !== void 0)
      return this.#fullpathPosix;
    if (this.sep === "/")
      return this.#fullpathPosix = this.fullpath();
    if (!this.parent) {
      const p2 = this.fullpath().replace(/\\/g, "/");
      if (/^[a-z]:\//i.test(p2)) {
        return this.#fullpathPosix = `//?/${p2}`;
      } else {
        return this.#fullpathPosix = p2;
      }
    }
    const p = this.parent;
    const pfpp = p.fullpathPosix();
    const fpp = pfpp + (!pfpp || !p.parent ? "" : "/") + this.name;
    return this.#fullpathPosix = fpp;
  }
  /**
   * Is the Path of an unknown type?
   *
   * Note that we might know *something* about it if there has been a previous
   * filesystem operation, for example that it does not exist, or is not a
   * link, or whether it has child entries.
   */
  isUnknown() {
    return (this.#type & IFMT) === UNKNOWN;
  }
  isType(type) {
    return this[`is${type}`]();
  }
  getType() {
    return this.isUnknown() ? "Unknown" : this.isDirectory() ? "Directory" : this.isFile() ? "File" : this.isSymbolicLink() ? "SymbolicLink" : this.isFIFO() ? "FIFO" : this.isCharacterDevice() ? "CharacterDevice" : this.isBlockDevice() ? "BlockDevice" : (
      /* c8 ignore start */
      this.isSocket() ? "Socket" : "Unknown"
    );
  }
  /**
   * Is the Path a regular file?
   */
  isFile() {
    return (this.#type & IFMT) === IFREG;
  }
  /**
   * Is the Path a directory?
   */
  isDirectory() {
    return (this.#type & IFMT) === IFDIR;
  }
  /**
   * Is the path a character device?
   */
  isCharacterDevice() {
    return (this.#type & IFMT) === IFCHR;
  }
  /**
   * Is the path a block device?
   */
  isBlockDevice() {
    return (this.#type & IFMT) === IFBLK;
  }
  /**
   * Is the path a FIFO pipe?
   */
  isFIFO() {
    return (this.#type & IFMT) === IFIFO;
  }
  /**
   * Is the path a socket?
   */
  isSocket() {
    return (this.#type & IFMT) === IFSOCK;
  }
  /**
   * Is the path a symbolic link?
   */
  isSymbolicLink() {
    return (this.#type & IFLNK) === IFLNK;
  }
  /**
   * Return the entry if it has been subject of a successful lstat, or
   * undefined otherwise.
   *
   * Does not read the filesystem, so an undefined result *could* simply
   * mean that we haven't called lstat on it.
   */
  lstatCached() {
    return this.#type & LSTAT_CALLED ? this : void 0;
  }
  /**
   * Return the cached link target if the entry has been the subject of a
   * successful readlink, or undefined otherwise.
   *
   * Does not read the filesystem, so an undefined result *could* just mean we
   * don't have any cached data. Only use it if you are very sure that a
   * readlink() has been called at some point.
   */
  readlinkCached() {
    return this.#linkTarget;
  }
  /**
   * Returns the cached realpath target if the entry has been the subject
   * of a successful realpath, or undefined otherwise.
   *
   * Does not read the filesystem, so an undefined result *could* just mean we
   * don't have any cached data. Only use it if you are very sure that a
   * realpath() has been called at some point.
   */
  realpathCached() {
    return this.#realpath;
  }
  /**
   * Returns the cached child Path entries array if the entry has been the
   * subject of a successful readdir(), or [] otherwise.
   *
   * Does not read the filesystem, so an empty array *could* just mean we
   * don't have any cached data. Only use it if you are very sure that a
   * readdir() has been called recently enough to still be valid.
   */
  readdirCached() {
    const children = this.children();
    return children.slice(0, children.provisional);
  }
  /**
   * Return true if it's worth trying to readlink.  Ie, we don't (yet) have
   * any indication that readlink will definitely fail.
   *
   * Returns false if the path is known to not be a symlink, if a previous
   * readlink failed, or if the entry does not exist.
   */
  canReadlink() {
    if (this.#linkTarget)
      return true;
    if (!this.parent)
      return false;
    const ifmt = this.#type & IFMT;
    return !(ifmt !== UNKNOWN && ifmt !== IFLNK || this.#type & ENOREADLINK || this.#type & ENOENT);
  }
  /**
   * Return true if readdir has previously been successfully called on this
   * path, indicating that cachedReaddir() is likely valid.
   */
  calledReaddir() {
    return !!(this.#type & READDIR_CALLED);
  }
  /**
   * Returns true if the path is known to not exist. That is, a previous lstat
   * or readdir failed to verify its existence when that would have been
   * expected, or a parent entry was marked either enoent or enotdir.
   */
  isENOENT() {
    return !!(this.#type & ENOENT);
  }
  /**
   * Return true if the path is a match for the given path name.  This handles
   * case sensitivity and unicode normalization.
   *
   * Note: even on case-sensitive systems, it is **not** safe to test the
   * equality of the `.name` property to determine whether a given pathname
   * matches, due to unicode normalization mismatches.
   *
   * Always use this method instead of testing the `path.name` property
   * directly.
   */
  isNamed(n) {
    return !this.nocase ? this.#matchName === normalize(n) : this.#matchName === normalizeNocase(n);
  }
  /**
   * Return the Path object corresponding to the target of a symbolic link.
   *
   * If the Path is not a symbolic link, or if the readlink call fails for any
   * reason, `undefined` is returned.
   *
   * Result is cached, and thus may be outdated if the filesystem is mutated.
   */
  async readlink() {
    const target = this.#linkTarget;
    if (target) {
      return target;
    }
    if (!this.canReadlink()) {
      return void 0;
    }
    if (!this.parent) {
      return void 0;
    }
    try {
      const read = await this.#fs.promises.readlink(this.fullpath());
      const linkTarget = (await this.parent.realpath())?.resolve(read);
      if (linkTarget) {
        return this.#linkTarget = linkTarget;
      }
    } catch (er) {
      this.#readlinkFail(er.code);
      return void 0;
    }
  }
  /**
   * Synchronous {@link PathBase.readlink}
   */
  readlinkSync() {
    const target = this.#linkTarget;
    if (target) {
      return target;
    }
    if (!this.canReadlink()) {
      return void 0;
    }
    if (!this.parent) {
      return void 0;
    }
    try {
      const read = this.#fs.readlinkSync(this.fullpath());
      const linkTarget = this.parent.realpathSync()?.resolve(read);
      if (linkTarget) {
        return this.#linkTarget = linkTarget;
      }
    } catch (er) {
      this.#readlinkFail(er.code);
      return void 0;
    }
  }
  #readdirSuccess(children) {
    this.#type |= READDIR_CALLED;
    for (let p = children.provisional; p < children.length; p++) {
      const c3 = children[p];
      if (c3)
        c3.#markENOENT();
    }
  }
  #markENOENT() {
    if (this.#type & ENOENT)
      return;
    this.#type = (this.#type | ENOENT) & IFMT_UNKNOWN;
    this.#markChildrenENOENT();
  }
  #markChildrenENOENT() {
    const children = this.children();
    children.provisional = 0;
    for (const p of children) {
      p.#markENOENT();
    }
  }
  #markENOREALPATH() {
    this.#type |= ENOREALPATH;
    this.#markENOTDIR();
  }
  // save the information when we know the entry is not a dir
  #markENOTDIR() {
    if (this.#type & ENOTDIR)
      return;
    let t = this.#type;
    if ((t & IFMT) === IFDIR)
      t &= IFMT_UNKNOWN;
    this.#type = t | ENOTDIR;
    this.#markChildrenENOENT();
  }
  #readdirFail(code = "") {
    if (code === "ENOTDIR" || code === "EPERM") {
      this.#markENOTDIR();
    } else if (code === "ENOENT") {
      this.#markENOENT();
    } else {
      this.children().provisional = 0;
    }
  }
  #lstatFail(code = "") {
    if (code === "ENOTDIR") {
      const p = this.parent;
      p.#markENOTDIR();
    } else if (code === "ENOENT") {
      this.#markENOENT();
    }
  }
  #readlinkFail(code = "") {
    let ter = this.#type;
    ter |= ENOREADLINK;
    if (code === "ENOENT")
      ter |= ENOENT;
    if (code === "EINVAL" || code === "UNKNOWN") {
      ter &= IFMT_UNKNOWN;
    }
    this.#type = ter;
    if (code === "ENOTDIR" && this.parent) {
      this.parent.#markENOTDIR();
    }
  }
  #readdirAddChild(e, c3) {
    return this.#readdirMaybePromoteChild(e, c3) || this.#readdirAddNewChild(e, c3);
  }
  #readdirAddNewChild(e, c3) {
    const type = entToType(e);
    const child = this.newChild(e.name, type, { parent: this });
    const ifmt = child.#type & IFMT;
    if (ifmt !== IFDIR && ifmt !== IFLNK && ifmt !== UNKNOWN) {
      child.#type |= ENOTDIR;
    }
    c3.unshift(child);
    c3.provisional++;
    return child;
  }
  #readdirMaybePromoteChild(e, c3) {
    for (let p = c3.provisional; p < c3.length; p++) {
      const pchild = c3[p];
      const name = this.nocase ? normalizeNocase(e.name) : normalize(e.name);
      if (name !== pchild.#matchName) {
        continue;
      }
      return this.#readdirPromoteChild(e, pchild, p, c3);
    }
  }
  #readdirPromoteChild(e, p, index, c3) {
    const v = p.name;
    p.#type = p.#type & IFMT_UNKNOWN | entToType(e);
    if (v !== e.name)
      p.name = e.name;
    if (index !== c3.provisional) {
      if (index === c3.length - 1)
        c3.pop();
      else
        c3.splice(index, 1);
      c3.unshift(p);
    }
    c3.provisional++;
    return p;
  }
  /**
   * Call lstat() on this Path, and update all known information that can be
   * determined.
   *
   * Note that unlike `fs.lstat()`, the returned value does not contain some
   * information, such as `mode`, `dev`, `nlink`, and `ino`.  If that
   * information is required, you will need to call `fs.lstat` yourself.
   *
   * If the Path refers to a nonexistent file, or if the lstat call fails for
   * any reason, `undefined` is returned.  Otherwise the updated Path object is
   * returned.
   *
   * Results are cached, and thus may be out of date if the filesystem is
   * mutated.
   */
  async lstat() {
    if ((this.#type & ENOENT) === 0) {
      try {
        this.#applyStat(await this.#fs.promises.lstat(this.fullpath()));
        return this;
      } catch (er) {
        this.#lstatFail(er.code);
      }
    }
  }
  /**
   * synchronous {@link PathBase.lstat}
   */
  lstatSync() {
    if ((this.#type & ENOENT) === 0) {
      try {
        this.#applyStat(this.#fs.lstatSync(this.fullpath()));
        return this;
      } catch (er) {
        this.#lstatFail(er.code);
      }
    }
  }
  #applyStat(st) {
    const { atime, atimeMs, birthtime, birthtimeMs, blksize, blocks, ctime, ctimeMs, dev, gid, ino, mode, mtime, mtimeMs, nlink, rdev, size, uid } = st;
    this.#atime = atime;
    this.#atimeMs = atimeMs;
    this.#birthtime = birthtime;
    this.#birthtimeMs = birthtimeMs;
    this.#blksize = blksize;
    this.#blocks = blocks;
    this.#ctime = ctime;
    this.#ctimeMs = ctimeMs;
    this.#dev = dev;
    this.#gid = gid;
    this.#ino = ino;
    this.#mode = mode;
    this.#mtime = mtime;
    this.#mtimeMs = mtimeMs;
    this.#nlink = nlink;
    this.#rdev = rdev;
    this.#size = size;
    this.#uid = uid;
    const ifmt = entToType(st);
    this.#type = this.#type & IFMT_UNKNOWN | ifmt | LSTAT_CALLED;
    if (ifmt !== UNKNOWN && ifmt !== IFDIR && ifmt !== IFLNK) {
      this.#type |= ENOTDIR;
    }
  }
  #onReaddirCB = [];
  #readdirCBInFlight = false;
  #callOnReaddirCB(children) {
    this.#readdirCBInFlight = false;
    const cbs = this.#onReaddirCB.slice();
    this.#onReaddirCB.length = 0;
    cbs.forEach((cb) => cb(null, children));
  }
  /**
   * Standard node-style callback interface to get list of directory entries.
   *
   * If the Path cannot or does not contain any children, then an empty array
   * is returned.
   *
   * Results are cached, and thus may be out of date if the filesystem is
   * mutated.
   *
   * @param cb The callback called with (er, entries).  Note that the `er`
   * param is somewhat extraneous, as all readdir() errors are handled and
   * simply result in an empty set of entries being returned.
   * @param allowZalgo Boolean indicating that immediately known results should
   * *not* be deferred with `queueMicrotask`. Defaults to `false`. Release
   * zalgo at your peril, the dark pony lord is devious and unforgiving.
   */
  readdirCB(cb, allowZalgo = false) {
    if (!this.canReaddir()) {
      if (allowZalgo)
        cb(null, []);
      else
        queueMicrotask(() => cb(null, []));
      return;
    }
    const children = this.children();
    if (this.calledReaddir()) {
      const c3 = children.slice(0, children.provisional);
      if (allowZalgo)
        cb(null, c3);
      else
        queueMicrotask(() => cb(null, c3));
      return;
    }
    this.#onReaddirCB.push(cb);
    if (this.#readdirCBInFlight) {
      return;
    }
    this.#readdirCBInFlight = true;
    const fullpath = this.fullpath();
    this.#fs.readdir(fullpath, { withFileTypes: true }, (er, entries) => {
      if (er) {
        this.#readdirFail(er.code);
        children.provisional = 0;
      } else {
        for (const e of entries) {
          this.#readdirAddChild(e, children);
        }
        this.#readdirSuccess(children);
      }
      this.#callOnReaddirCB(children.slice(0, children.provisional));
      return;
    });
  }
  #asyncReaddirInFlight;
  /**
   * Return an array of known child entries.
   *
   * If the Path cannot or does not contain any children, then an empty array
   * is returned.
   *
   * Results are cached, and thus may be out of date if the filesystem is
   * mutated.
   */
  async readdir() {
    if (!this.canReaddir()) {
      return [];
    }
    const children = this.children();
    if (this.calledReaddir()) {
      return children.slice(0, children.provisional);
    }
    const fullpath = this.fullpath();
    if (this.#asyncReaddirInFlight) {
      await this.#asyncReaddirInFlight;
    } else {
      let resolve4 = () => {
      };
      this.#asyncReaddirInFlight = new Promise((res) => resolve4 = res);
      try {
        for (const e of await this.#fs.promises.readdir(fullpath, {
          withFileTypes: true
        })) {
          this.#readdirAddChild(e, children);
        }
        this.#readdirSuccess(children);
      } catch (er) {
        this.#readdirFail(er.code);
        children.provisional = 0;
      }
      this.#asyncReaddirInFlight = void 0;
      resolve4();
    }
    return children.slice(0, children.provisional);
  }
  /**
   * synchronous {@link PathBase.readdir}
   */
  readdirSync() {
    if (!this.canReaddir()) {
      return [];
    }
    const children = this.children();
    if (this.calledReaddir()) {
      return children.slice(0, children.provisional);
    }
    const fullpath = this.fullpath();
    try {
      for (const e of this.#fs.readdirSync(fullpath, {
        withFileTypes: true
      })) {
        this.#readdirAddChild(e, children);
      }
      this.#readdirSuccess(children);
    } catch (er) {
      this.#readdirFail(er.code);
      children.provisional = 0;
    }
    return children.slice(0, children.provisional);
  }
  canReaddir() {
    if (this.#type & ENOCHILD)
      return false;
    const ifmt = IFMT & this.#type;
    if (!(ifmt === UNKNOWN || ifmt === IFDIR || ifmt === IFLNK)) {
      return false;
    }
    return true;
  }
  shouldWalk(dirs, walkFilter) {
    return (this.#type & IFDIR) === IFDIR && !(this.#type & ENOCHILD) && !dirs.has(this) && (!walkFilter || walkFilter(this));
  }
  /**
   * Return the Path object corresponding to path as resolved
   * by realpath(3).
   *
   * If the realpath call fails for any reason, `undefined` is returned.
   *
   * Result is cached, and thus may be outdated if the filesystem is mutated.
   * On success, returns a Path object.
   */
  async realpath() {
    if (this.#realpath)
      return this.#realpath;
    if ((ENOREALPATH | ENOREADLINK | ENOENT) & this.#type)
      return void 0;
    try {
      const rp = await this.#fs.promises.realpath(this.fullpath());
      return this.#realpath = this.resolve(rp);
    } catch (_) {
      this.#markENOREALPATH();
    }
  }
  /**
   * Synchronous {@link realpath}
   */
  realpathSync() {
    if (this.#realpath)
      return this.#realpath;
    if ((ENOREALPATH | ENOREADLINK | ENOENT) & this.#type)
      return void 0;
    try {
      const rp = this.#fs.realpathSync(this.fullpath());
      return this.#realpath = this.resolve(rp);
    } catch (_) {
      this.#markENOREALPATH();
    }
  }
  /**
   * Internal method to mark this Path object as the scurry cwd,
   * called by {@link PathScurry#chdir}
   *
   * @internal
   */
  [setAsCwd](oldCwd) {
    if (oldCwd === this)
      return;
    oldCwd.isCWD = false;
    this.isCWD = true;
    const changed = /* @__PURE__ */ new Set([]);
    let rp = [];
    let p = this;
    while (p && p.parent) {
      changed.add(p);
      p.#relative = rp.join(this.sep);
      p.#relativePosix = rp.join("/");
      p = p.parent;
      rp.push("..");
    }
    p = oldCwd;
    while (p && p.parent && !changed.has(p)) {
      p.#relative = void 0;
      p.#relativePosix = void 0;
      p = p.parent;
    }
  }
};
var PathWin32 = class _PathWin32 extends PathBase {
  /**
   * Separator for generating path strings.
   */
  sep = "\\";
  /**
   * Separator for parsing path strings.
   */
  splitSep = eitherSep;
  /**
   * Do not create new Path objects directly.  They should always be accessed
   * via the PathScurry class or other methods on the Path class.
   *
   * @internal
   */
  constructor(name, type = UNKNOWN, root, roots, nocase, children, opts) {
    super(name, type, root, roots, nocase, children, opts);
  }
  /**
   * @internal
   */
  newChild(name, type = UNKNOWN, opts = {}) {
    return new _PathWin32(name, type, this.root, this.roots, this.nocase, this.childrenCache(), opts);
  }
  /**
   * @internal
   */
  getRootString(path2) {
    return win32.parse(path2).root;
  }
  /**
   * @internal
   */
  getRoot(rootPath) {
    rootPath = uncToDrive(rootPath.toUpperCase());
    if (rootPath === this.root.name) {
      return this.root;
    }
    for (const [compare, root] of Object.entries(this.roots)) {
      if (this.sameRoot(rootPath, compare)) {
        return this.roots[rootPath] = root;
      }
    }
    return this.roots[rootPath] = new PathScurryWin32(rootPath, this).root;
  }
  /**
   * @internal
   */
  sameRoot(rootPath, compare = this.root.name) {
    rootPath = rootPath.toUpperCase().replace(/\//g, "\\").replace(uncDriveRegexp, "$1\\");
    return rootPath === compare;
  }
};
var PathPosix = class _PathPosix extends PathBase {
  /**
   * separator for parsing path strings
   */
  splitSep = "/";
  /**
   * separator for generating path strings
   */
  sep = "/";
  /**
   * Do not create new Path objects directly.  They should always be accessed
   * via the PathScurry class or other methods on the Path class.
   *
   * @internal
   */
  constructor(name, type = UNKNOWN, root, roots, nocase, children, opts) {
    super(name, type, root, roots, nocase, children, opts);
  }
  /**
   * @internal
   */
  getRootString(path2) {
    return path2.startsWith("/") ? "/" : "";
  }
  /**
   * @internal
   */
  getRoot(_rootPath) {
    return this.root;
  }
  /**
   * @internal
   */
  newChild(name, type = UNKNOWN, opts = {}) {
    return new _PathPosix(name, type, this.root, this.roots, this.nocase, this.childrenCache(), opts);
  }
};
var PathScurryBase = class {
  /**
   * The root Path entry for the current working directory of this Scurry
   */
  root;
  /**
   * The string path for the root of this Scurry's current working directory
   */
  rootPath;
  /**
   * A collection of all roots encountered, referenced by rootPath
   */
  roots;
  /**
   * The Path entry corresponding to this PathScurry's current working directory.
   */
  cwd;
  #resolveCache;
  #resolvePosixCache;
  #children;
  /**
   * Perform path comparisons case-insensitively.
   *
   * Defaults true on Darwin and Windows systems, false elsewhere.
   */
  nocase;
  #fs;
  /**
   * This class should not be instantiated directly.
   *
   * Use PathScurryWin32, PathScurryDarwin, PathScurryPosix, or PathScurry
   *
   * @internal
   */
  constructor(cwd = process.cwd(), pathImpl, sep2, { nocase, childrenCacheSize = 16 * 1024, fs = defaultFS } = {}) {
    this.#fs = fsFromOption(fs);
    if (cwd instanceof URL || cwd.startsWith("file://")) {
      cwd = fileURLToPath(cwd);
    }
    const cwdPath = pathImpl.resolve(cwd);
    this.roots = /* @__PURE__ */ Object.create(null);
    this.rootPath = this.parseRootPath(cwdPath);
    this.#resolveCache = new ResolveCache();
    this.#resolvePosixCache = new ResolveCache();
    this.#children = new ChildrenCache(childrenCacheSize);
    const split = cwdPath.substring(this.rootPath.length).split(sep2);
    if (split.length === 1 && !split[0]) {
      split.pop();
    }
    if (nocase === void 0) {
      throw new TypeError("must provide nocase setting to PathScurryBase ctor");
    }
    this.nocase = nocase;
    this.root = this.newRoot(this.#fs);
    this.roots[this.rootPath] = this.root;
    let prev = this.root;
    let len = split.length - 1;
    const joinSep = pathImpl.sep;
    let abs = this.rootPath;
    let sawFirst = false;
    for (const part of split) {
      const l = len--;
      prev = prev.child(part, {
        relative: new Array(l).fill("..").join(joinSep),
        relativePosix: new Array(l).fill("..").join("/"),
        fullpath: abs += (sawFirst ? "" : joinSep) + part
      });
      sawFirst = true;
    }
    this.cwd = prev;
  }
  /**
   * Get the depth of a provided path, string, or the cwd
   */
  depth(path2 = this.cwd) {
    if (typeof path2 === "string") {
      path2 = this.cwd.resolve(path2);
    }
    return path2.depth();
  }
  /**
   * Return the cache of child entries.  Exposed so subclasses can create
   * child Path objects in a platform-specific way.
   *
   * @internal
   */
  childrenCache() {
    return this.#children;
  }
  /**
   * Resolve one or more path strings to a resolved string
   *
   * Same interface as require('path').resolve.
   *
   * Much faster than path.resolve() when called multiple times for the same
   * path, because the resolved Path objects are cached.  Much slower
   * otherwise.
   */
  resolve(...paths) {
    let r = "";
    for (let i = paths.length - 1; i >= 0; i--) {
      const p = paths[i];
      if (!p || p === ".")
        continue;
      r = r ? `${p}/${r}` : p;
      if (this.isAbsolute(p)) {
        break;
      }
    }
    const cached = this.#resolveCache.get(r);
    if (cached !== void 0) {
      return cached;
    }
    const result = this.cwd.resolve(r).fullpath();
    this.#resolveCache.set(r, result);
    return result;
  }
  /**
   * Resolve one or more path strings to a resolved string, returning
   * the posix path.  Identical to .resolve() on posix systems, but on
   * windows will return a forward-slash separated UNC path.
   *
   * Same interface as require('path').resolve.
   *
   * Much faster than path.resolve() when called multiple times for the same
   * path, because the resolved Path objects are cached.  Much slower
   * otherwise.
   */
  resolvePosix(...paths) {
    let r = "";
    for (let i = paths.length - 1; i >= 0; i--) {
      const p = paths[i];
      if (!p || p === ".")
        continue;
      r = r ? `${p}/${r}` : p;
      if (this.isAbsolute(p)) {
        break;
      }
    }
    const cached = this.#resolvePosixCache.get(r);
    if (cached !== void 0) {
      return cached;
    }
    const result = this.cwd.resolve(r).fullpathPosix();
    this.#resolvePosixCache.set(r, result);
    return result;
  }
  /**
   * find the relative path from the cwd to the supplied path string or entry
   */
  relative(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.relative();
  }
  /**
   * find the relative path from the cwd to the supplied path string or
   * entry, using / as the path delimiter, even on Windows.
   */
  relativePosix(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.relativePosix();
  }
  /**
   * Return the basename for the provided string or Path object
   */
  basename(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.name;
  }
  /**
   * Return the dirname for the provided string or Path object
   */
  dirname(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return (entry.parent || entry).fullpath();
  }
  async readdir(entry = this.cwd, opts = {
    withFileTypes: true
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes } = opts;
    if (!entry.canReaddir()) {
      return [];
    } else {
      const p = await entry.readdir();
      return withFileTypes ? p : p.map((e) => e.name);
    }
  }
  readdirSync(entry = this.cwd, opts = {
    withFileTypes: true
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true } = opts;
    if (!entry.canReaddir()) {
      return [];
    } else if (withFileTypes) {
      return entry.readdirSync();
    } else {
      return entry.readdirSync().map((e) => e.name);
    }
  }
  /**
   * Call lstat() on the string or Path object, and update all known
   * information that can be determined.
   *
   * Note that unlike `fs.lstat()`, the returned value does not contain some
   * information, such as `mode`, `dev`, `nlink`, and `ino`.  If that
   * information is required, you will need to call `fs.lstat` yourself.
   *
   * If the Path refers to a nonexistent file, or if the lstat call fails for
   * any reason, `undefined` is returned.  Otherwise the updated Path object is
   * returned.
   *
   * Results are cached, and thus may be out of date if the filesystem is
   * mutated.
   */
  async lstat(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.lstat();
  }
  /**
   * synchronous {@link PathScurryBase.lstat}
   */
  lstatSync(entry = this.cwd) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    }
    return entry.lstatSync();
  }
  async readlink(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = await entry.readlink();
    return withFileTypes ? e : e?.fullpath();
  }
  readlinkSync(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = entry.readlinkSync();
    return withFileTypes ? e : e?.fullpath();
  }
  async realpath(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = await entry.realpath();
    return withFileTypes ? e : e?.fullpath();
  }
  realpathSync(entry = this.cwd, { withFileTypes } = {
    withFileTypes: false
  }) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      withFileTypes = entry.withFileTypes;
      entry = this.cwd;
    }
    const e = entry.realpathSync();
    return withFileTypes ? e : e?.fullpath();
  }
  async walk(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = [];
    if (!filter2 || filter2(entry)) {
      results.push(withFileTypes ? entry : entry.fullpath());
    }
    const dirs = /* @__PURE__ */ new Set();
    const walk = (dir, cb) => {
      dirs.add(dir);
      dir.readdirCB((er, entries) => {
        if (er) {
          return cb(er);
        }
        let len = entries.length;
        if (!len)
          return cb();
        const next = () => {
          if (--len === 0) {
            cb();
          }
        };
        for (const e of entries) {
          if (!filter2 || filter2(e)) {
            results.push(withFileTypes ? e : e.fullpath());
          }
          if (follow && e.isSymbolicLink()) {
            e.realpath().then((r) => r?.isUnknown() ? r.lstat() : r).then((r) => r?.shouldWalk(dirs, walkFilter) ? walk(r, next) : next());
          } else {
            if (e.shouldWalk(dirs, walkFilter)) {
              walk(e, next);
            } else {
              next();
            }
          }
        }
      }, true);
    };
    const start = entry;
    return new Promise((res, rej) => {
      walk(start, (er) => {
        if (er)
          return rej(er);
        res(results);
      });
    });
  }
  walkSync(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = [];
    if (!filter2 || filter2(entry)) {
      results.push(withFileTypes ? entry : entry.fullpath());
    }
    const dirs = /* @__PURE__ */ new Set([entry]);
    for (const dir of dirs) {
      const entries = dir.readdirSync();
      for (const e of entries) {
        if (!filter2 || filter2(e)) {
          results.push(withFileTypes ? e : e.fullpath());
        }
        let r = e;
        if (e.isSymbolicLink()) {
          if (!(follow && (r = e.realpathSync())))
            continue;
          if (r.isUnknown())
            r.lstatSync();
        }
        if (r.shouldWalk(dirs, walkFilter)) {
          dirs.add(r);
        }
      }
    }
    return results;
  }
  /**
   * Support for `for await`
   *
   * Alias for {@link PathScurryBase.iterate}
   *
   * Note: As of Node 19, this is very slow, compared to other methods of
   * walking.  Consider using {@link PathScurryBase.stream} if memory overhead
   * and backpressure are concerns, or {@link PathScurryBase.walk} if not.
   */
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
  iterate(entry = this.cwd, options = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      options = entry;
      entry = this.cwd;
    }
    return this.stream(entry, options)[Symbol.asyncIterator]();
  }
  /**
   * Iterating over a PathScurry performs a synchronous walk.
   *
   * Alias for {@link PathScurryBase.iterateSync}
   */
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  *iterateSync(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    if (!filter2 || filter2(entry)) {
      yield withFileTypes ? entry : entry.fullpath();
    }
    const dirs = /* @__PURE__ */ new Set([entry]);
    for (const dir of dirs) {
      const entries = dir.readdirSync();
      for (const e of entries) {
        if (!filter2 || filter2(e)) {
          yield withFileTypes ? e : e.fullpath();
        }
        let r = e;
        if (e.isSymbolicLink()) {
          if (!(follow && (r = e.realpathSync())))
            continue;
          if (r.isUnknown())
            r.lstatSync();
        }
        if (r.shouldWalk(dirs, walkFilter)) {
          dirs.add(r);
        }
      }
    }
  }
  stream(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = new Minipass({ objectMode: true });
    if (!filter2 || filter2(entry)) {
      results.write(withFileTypes ? entry : entry.fullpath());
    }
    const dirs = /* @__PURE__ */ new Set();
    const queue = [entry];
    let processing = 0;
    const process2 = () => {
      let paused = false;
      while (!paused) {
        const dir = queue.shift();
        if (!dir) {
          if (processing === 0)
            results.end();
          return;
        }
        processing++;
        dirs.add(dir);
        const onReaddir = (er, entries, didRealpaths = false) => {
          if (er)
            return results.emit("error", er);
          if (follow && !didRealpaths) {
            const promises = [];
            for (const e of entries) {
              if (e.isSymbolicLink()) {
                promises.push(e.realpath().then((r) => r?.isUnknown() ? r.lstat() : r));
              }
            }
            if (promises.length) {
              Promise.all(promises).then(() => onReaddir(null, entries, true));
              return;
            }
          }
          for (const e of entries) {
            if (e && (!filter2 || filter2(e))) {
              if (!results.write(withFileTypes ? e : e.fullpath())) {
                paused = true;
              }
            }
          }
          processing--;
          for (const e of entries) {
            const r = e.realpathCached() || e;
            if (r.shouldWalk(dirs, walkFilter)) {
              queue.push(r);
            }
          }
          if (paused && !results.flowing) {
            results.once("drain", process2);
          } else if (!sync2) {
            process2();
          }
        };
        let sync2 = true;
        dir.readdirCB(onReaddir, true);
        sync2 = false;
      }
    };
    process2();
    return results;
  }
  streamSync(entry = this.cwd, opts = {}) {
    if (typeof entry === "string") {
      entry = this.cwd.resolve(entry);
    } else if (!(entry instanceof PathBase)) {
      opts = entry;
      entry = this.cwd;
    }
    const { withFileTypes = true, follow = false, filter: filter2, walkFilter } = opts;
    const results = new Minipass({ objectMode: true });
    const dirs = /* @__PURE__ */ new Set();
    if (!filter2 || filter2(entry)) {
      results.write(withFileTypes ? entry : entry.fullpath());
    }
    const queue = [entry];
    let processing = 0;
    const process2 = () => {
      let paused = false;
      while (!paused) {
        const dir = queue.shift();
        if (!dir) {
          if (processing === 0)
            results.end();
          return;
        }
        processing++;
        dirs.add(dir);
        const entries = dir.readdirSync();
        for (const e of entries) {
          if (!filter2 || filter2(e)) {
            if (!results.write(withFileTypes ? e : e.fullpath())) {
              paused = true;
            }
          }
        }
        processing--;
        for (const e of entries) {
          let r = e;
          if (e.isSymbolicLink()) {
            if (!(follow && (r = e.realpathSync())))
              continue;
            if (r.isUnknown())
              r.lstatSync();
          }
          if (r.shouldWalk(dirs, walkFilter)) {
            queue.push(r);
          }
        }
      }
      if (paused && !results.flowing)
        results.once("drain", process2);
    };
    process2();
    return results;
  }
  chdir(path2 = this.cwd) {
    const oldCwd = this.cwd;
    this.cwd = typeof path2 === "string" ? this.cwd.resolve(path2) : path2;
    this.cwd[setAsCwd](oldCwd);
  }
};
var PathScurryWin32 = class extends PathScurryBase {
  /**
   * separator for generating path strings
   */
  sep = "\\";
  constructor(cwd = process.cwd(), opts = {}) {
    const { nocase = true } = opts;
    super(cwd, win32, "\\", { ...opts, nocase });
    this.nocase = nocase;
    for (let p = this.cwd; p; p = p.parent) {
      p.nocase = this.nocase;
    }
  }
  /**
   * @internal
   */
  parseRootPath(dir) {
    return win32.parse(dir).root.toUpperCase();
  }
  /**
   * @internal
   */
  newRoot(fs) {
    return new PathWin32(this.rootPath, IFDIR, void 0, this.roots, this.nocase, this.childrenCache(), { fs });
  }
  /**
   * Return true if the provided path string is an absolute path
   */
  isAbsolute(p) {
    return p.startsWith("/") || p.startsWith("\\") || /^[a-z]:(\/|\\)/i.test(p);
  }
};
var PathScurryPosix = class extends PathScurryBase {
  /**
   * separator for generating path strings
   */
  sep = "/";
  constructor(cwd = process.cwd(), opts = {}) {
    const { nocase = false } = opts;
    super(cwd, posix, "/", { ...opts, nocase });
    this.nocase = nocase;
  }
  /**
   * @internal
   */
  parseRootPath(_dir) {
    return "/";
  }
  /**
   * @internal
   */
  newRoot(fs) {
    return new PathPosix(this.rootPath, IFDIR, void 0, this.roots, this.nocase, this.childrenCache(), { fs });
  }
  /**
   * Return true if the provided path string is an absolute path
   */
  isAbsolute(p) {
    return p.startsWith("/");
  }
};
var PathScurryDarwin = class extends PathScurryPosix {
  constructor(cwd = process.cwd(), opts = {}) {
    const { nocase = true } = opts;
    super(cwd, { ...opts, nocase });
  }
};
var Path = process.platform === "win32" ? PathWin32 : PathPosix;
var PathScurry = process.platform === "win32" ? PathScurryWin32 : process.platform === "darwin" ? PathScurryDarwin : PathScurryPosix;

// node_modules/glob/dist/esm/pattern.js
var isPatternList = (pl) => pl.length >= 1;
var isGlobList = (gl) => gl.length >= 1;
var Pattern = class _Pattern {
  #patternList;
  #globList;
  #index;
  length;
  #platform;
  #rest;
  #globString;
  #isDrive;
  #isUNC;
  #isAbsolute;
  #followGlobstar = true;
  constructor(patternList, globList, index, platform) {
    if (!isPatternList(patternList)) {
      throw new TypeError("empty pattern list");
    }
    if (!isGlobList(globList)) {
      throw new TypeError("empty glob list");
    }
    if (globList.length !== patternList.length) {
      throw new TypeError("mismatched pattern list and glob list lengths");
    }
    this.length = patternList.length;
    if (index < 0 || index >= this.length) {
      throw new TypeError("index out of range");
    }
    this.#patternList = patternList;
    this.#globList = globList;
    this.#index = index;
    this.#platform = platform;
    if (this.#index === 0) {
      if (this.isUNC()) {
        const [p0, p1, p2, p3, ...prest] = this.#patternList;
        const [g0, g1, g2, g3, ...grest] = this.#globList;
        if (prest[0] === "") {
          prest.shift();
          grest.shift();
        }
        const p = [p0, p1, p2, p3, ""].join("/");
        const g = [g0, g1, g2, g3, ""].join("/");
        this.#patternList = [p, ...prest];
        this.#globList = [g, ...grest];
        this.length = this.#patternList.length;
      } else if (this.isDrive() || this.isAbsolute()) {
        const [p1, ...prest] = this.#patternList;
        const [g1, ...grest] = this.#globList;
        if (prest[0] === "") {
          prest.shift();
          grest.shift();
        }
        const p = p1 + "/";
        const g = g1 + "/";
        this.#patternList = [p, ...prest];
        this.#globList = [g, ...grest];
        this.length = this.#patternList.length;
      }
    }
  }
  /**
   * The first entry in the parsed list of patterns
   */
  pattern() {
    return this.#patternList[this.#index];
  }
  /**
   * true of if pattern() returns a string
   */
  isString() {
    return typeof this.#patternList[this.#index] === "string";
  }
  /**
   * true of if pattern() returns GLOBSTAR
   */
  isGlobstar() {
    return this.#patternList[this.#index] === GLOBSTAR;
  }
  /**
   * true if pattern() returns a regexp
   */
  isRegExp() {
    return this.#patternList[this.#index] instanceof RegExp;
  }
  /**
   * The /-joined set of glob parts that make up this pattern
   */
  globString() {
    return this.#globString = this.#globString || (this.#index === 0 ? this.isAbsolute() ? this.#globList[0] + this.#globList.slice(1).join("/") : this.#globList.join("/") : this.#globList.slice(this.#index).join("/"));
  }
  /**
   * true if there are more pattern parts after this one
   */
  hasMore() {
    return this.length > this.#index + 1;
  }
  /**
   * The rest of the pattern after this part, or null if this is the end
   */
  rest() {
    if (this.#rest !== void 0)
      return this.#rest;
    if (!this.hasMore())
      return this.#rest = null;
    this.#rest = new _Pattern(this.#patternList, this.#globList, this.#index + 1, this.#platform);
    this.#rest.#isAbsolute = this.#isAbsolute;
    this.#rest.#isUNC = this.#isUNC;
    this.#rest.#isDrive = this.#isDrive;
    return this.#rest;
  }
  /**
   * true if the pattern represents a //unc/path/ on windows
   */
  isUNC() {
    const pl = this.#patternList;
    return this.#isUNC !== void 0 ? this.#isUNC : this.#isUNC = this.#platform === "win32" && this.#index === 0 && pl[0] === "" && pl[1] === "" && typeof pl[2] === "string" && !!pl[2] && typeof pl[3] === "string" && !!pl[3];
  }
  // pattern like C:/...
  // split = ['C:', ...]
  // XXX: would be nice to handle patterns like `c:*` to test the cwd
  // in c: for *, but I don't know of a way to even figure out what that
  // cwd is without actually chdir'ing into it?
  /**
   * True if the pattern starts with a drive letter on Windows
   */
  isDrive() {
    const pl = this.#patternList;
    return this.#isDrive !== void 0 ? this.#isDrive : this.#isDrive = this.#platform === "win32" && this.#index === 0 && this.length > 1 && typeof pl[0] === "string" && /^[a-z]:$/i.test(pl[0]);
  }
  // pattern = '/' or '/...' or '/x/...'
  // split = ['', ''] or ['', ...] or ['', 'x', ...]
  // Drive and UNC both considered absolute on windows
  /**
   * True if the pattern is rooted on an absolute path
   */
  isAbsolute() {
    const pl = this.#patternList;
    return this.#isAbsolute !== void 0 ? this.#isAbsolute : this.#isAbsolute = pl[0] === "" && pl.length > 1 || this.isDrive() || this.isUNC();
  }
  /**
   * consume the root of the pattern, and return it
   */
  root() {
    const p = this.#patternList[0];
    return typeof p === "string" && this.isAbsolute() && this.#index === 0 ? p : "";
  }
  /**
   * Check to see if the current globstar pattern is allowed to follow
   * a symbolic link.
   */
  checkFollowGlobstar() {
    return !(this.#index === 0 || !this.isGlobstar() || !this.#followGlobstar);
  }
  /**
   * Mark that the current globstar pattern is following a symbolic link
   */
  markFollowGlobstar() {
    if (this.#index === 0 || !this.isGlobstar() || !this.#followGlobstar)
      return false;
    this.#followGlobstar = false;
    return true;
  }
};

// node_modules/glob/dist/esm/ignore.js
var defaultPlatform2 = typeof process === "object" && process && typeof process.platform === "string" ? process.platform : "linux";
var Ignore = class {
  relative;
  relativeChildren;
  absolute;
  absoluteChildren;
  platform;
  mmopts;
  constructor(ignored, { nobrace, nocase, noext, noglobstar, platform = defaultPlatform2 }) {
    this.relative = [];
    this.absolute = [];
    this.relativeChildren = [];
    this.absoluteChildren = [];
    this.platform = platform;
    this.mmopts = {
      dot: true,
      nobrace,
      nocase,
      noext,
      noglobstar,
      optimizationLevel: 2,
      platform,
      nocomment: true,
      nonegate: true
    };
    for (const ign of ignored)
      this.add(ign);
  }
  add(ign) {
    const mm = new Minimatch(ign, this.mmopts);
    for (let i = 0; i < mm.set.length; i++) {
      const parsed = mm.set[i];
      const globParts = mm.globParts[i];
      if (!parsed || !globParts) {
        throw new Error("invalid pattern object");
      }
      while (parsed[0] === "." && globParts[0] === ".") {
        parsed.shift();
        globParts.shift();
      }
      const p = new Pattern(parsed, globParts, 0, this.platform);
      const m = new Minimatch(p.globString(), this.mmopts);
      const children = globParts[globParts.length - 1] === "**";
      const absolute = p.isAbsolute();
      if (absolute)
        this.absolute.push(m);
      else
        this.relative.push(m);
      if (children) {
        if (absolute)
          this.absoluteChildren.push(m);
        else
          this.relativeChildren.push(m);
      }
    }
  }
  ignored(p) {
    const fullpath = p.fullpath();
    const fullpaths = `${fullpath}/`;
    const relative = p.relative() || ".";
    const relatives = `${relative}/`;
    for (const m of this.relative) {
      if (m.match(relative) || m.match(relatives))
        return true;
    }
    for (const m of this.absolute) {
      if (m.match(fullpath) || m.match(fullpaths))
        return true;
    }
    return false;
  }
  childrenIgnored(p) {
    const fullpath = p.fullpath() + "/";
    const relative = (p.relative() || ".") + "/";
    for (const m of this.relativeChildren) {
      if (m.match(relative))
        return true;
    }
    for (const m of this.absoluteChildren) {
      if (m.match(fullpath))
        return true;
    }
    return false;
  }
};

// node_modules/glob/dist/esm/processor.js
var HasWalkedCache = class _HasWalkedCache {
  store;
  constructor(store = /* @__PURE__ */ new Map()) {
    this.store = store;
  }
  copy() {
    return new _HasWalkedCache(new Map(this.store));
  }
  hasWalked(target, pattern) {
    return this.store.get(target.fullpath())?.has(pattern.globString());
  }
  storeWalked(target, pattern) {
    const fullpath = target.fullpath();
    const cached = this.store.get(fullpath);
    if (cached)
      cached.add(pattern.globString());
    else
      this.store.set(fullpath, /* @__PURE__ */ new Set([pattern.globString()]));
  }
};
var MatchRecord = class {
  store = /* @__PURE__ */ new Map();
  add(target, absolute, ifDir) {
    const n = (absolute ? 2 : 0) | (ifDir ? 1 : 0);
    const current = this.store.get(target);
    this.store.set(target, current === void 0 ? n : n & current);
  }
  // match, absolute, ifdir
  entries() {
    return [...this.store.entries()].map(([path2, n]) => [
      path2,
      !!(n & 2),
      !!(n & 1)
    ]);
  }
};
var SubWalks = class {
  store = /* @__PURE__ */ new Map();
  add(target, pattern) {
    if (!target.canReaddir()) {
      return;
    }
    const subs = this.store.get(target);
    if (subs) {
      if (!subs.find((p) => p.globString() === pattern.globString())) {
        subs.push(pattern);
      }
    } else
      this.store.set(target, [pattern]);
  }
  get(target) {
    const subs = this.store.get(target);
    if (!subs) {
      throw new Error("attempting to walk unknown path");
    }
    return subs;
  }
  entries() {
    return this.keys().map((k) => [k, this.store.get(k)]);
  }
  keys() {
    return [...this.store.keys()].filter((t) => t.canReaddir());
  }
};
var Processor = class _Processor {
  hasWalkedCache;
  matches = new MatchRecord();
  subwalks = new SubWalks();
  patterns;
  follow;
  dot;
  opts;
  constructor(opts, hasWalkedCache) {
    this.opts = opts;
    this.follow = !!opts.follow;
    this.dot = !!opts.dot;
    this.hasWalkedCache = hasWalkedCache ? hasWalkedCache.copy() : new HasWalkedCache();
  }
  processPatterns(target, patterns) {
    this.patterns = patterns;
    const processingSet = patterns.map((p) => [target, p]);
    for (let [t, pattern] of processingSet) {
      this.hasWalkedCache.storeWalked(t, pattern);
      const root = pattern.root();
      const absolute = pattern.isAbsolute() && this.opts.absolute !== false;
      if (root) {
        t = t.resolve(root === "/" && this.opts.root !== void 0 ? this.opts.root : root);
        const rest2 = pattern.rest();
        if (!rest2) {
          this.matches.add(t, true, false);
          continue;
        } else {
          pattern = rest2;
        }
      }
      if (t.isENOENT())
        continue;
      let p;
      let rest;
      let changed = false;
      while (typeof (p = pattern.pattern()) === "string" && (rest = pattern.rest())) {
        const c3 = t.resolve(p);
        t = c3;
        pattern = rest;
        changed = true;
      }
      p = pattern.pattern();
      rest = pattern.rest();
      if (changed) {
        if (this.hasWalkedCache.hasWalked(t, pattern))
          continue;
        this.hasWalkedCache.storeWalked(t, pattern);
      }
      if (typeof p === "string") {
        const ifDir = p === ".." || p === "" || p === ".";
        this.matches.add(t.resolve(p), absolute, ifDir);
        continue;
      } else if (p === GLOBSTAR) {
        if (!t.isSymbolicLink() || this.follow || pattern.checkFollowGlobstar()) {
          this.subwalks.add(t, pattern);
        }
        const rp = rest?.pattern();
        const rrest = rest?.rest();
        if (!rest || (rp === "" || rp === ".") && !rrest) {
          this.matches.add(t, absolute, rp === "" || rp === ".");
        } else {
          if (rp === "..") {
            const tp = t.parent || t;
            if (!rrest)
              this.matches.add(tp, absolute, true);
            else if (!this.hasWalkedCache.hasWalked(tp, rrest)) {
              this.subwalks.add(tp, rrest);
            }
          }
        }
      } else if (p instanceof RegExp) {
        this.subwalks.add(t, pattern);
      }
    }
    return this;
  }
  subwalkTargets() {
    return this.subwalks.keys();
  }
  child() {
    return new _Processor(this.opts, this.hasWalkedCache);
  }
  // return a new Processor containing the subwalks for each
  // child entry, and a set of matches, and
  // a hasWalkedCache that's a copy of this one
  // then we're going to call
  filterEntries(parent, entries) {
    const patterns = this.subwalks.get(parent);
    const results = this.child();
    for (const e of entries) {
      for (const pattern of patterns) {
        const absolute = pattern.isAbsolute();
        const p = pattern.pattern();
        const rest = pattern.rest();
        if (p === GLOBSTAR) {
          results.testGlobstar(e, pattern, rest, absolute);
        } else if (p instanceof RegExp) {
          results.testRegExp(e, p, rest, absolute);
        } else {
          results.testString(e, p, rest, absolute);
        }
      }
    }
    return results;
  }
  testGlobstar(e, pattern, rest, absolute) {
    if (this.dot || !e.name.startsWith(".")) {
      if (!pattern.hasMore()) {
        this.matches.add(e, absolute, false);
      }
      if (e.canReaddir()) {
        if (this.follow || !e.isSymbolicLink()) {
          this.subwalks.add(e, pattern);
        } else if (e.isSymbolicLink()) {
          if (rest && pattern.checkFollowGlobstar()) {
            this.subwalks.add(e, rest);
          } else if (pattern.markFollowGlobstar()) {
            this.subwalks.add(e, pattern);
          }
        }
      }
    }
    if (rest) {
      const rp = rest.pattern();
      if (typeof rp === "string" && // dots and empty were handled already
      rp !== ".." && rp !== "" && rp !== ".") {
        this.testString(e, rp, rest.rest(), absolute);
      } else if (rp === "..") {
        const ep = e.parent || e;
        this.subwalks.add(ep, rest);
      } else if (rp instanceof RegExp) {
        this.testRegExp(e, rp, rest.rest(), absolute);
      }
    }
  }
  testRegExp(e, p, rest, absolute) {
    if (!p.test(e.name))
      return;
    if (!rest) {
      this.matches.add(e, absolute, false);
    } else {
      this.subwalks.add(e, rest);
    }
  }
  testString(e, p, rest, absolute) {
    if (!e.isNamed(p))
      return;
    if (!rest) {
      this.matches.add(e, absolute, false);
    } else {
      this.subwalks.add(e, rest);
    }
  }
};

// node_modules/glob/dist/esm/walker.js
var makeIgnore = (ignore, opts) => typeof ignore === "string" ? new Ignore([ignore], opts) : Array.isArray(ignore) ? new Ignore(ignore, opts) : ignore;
var GlobUtil = class {
  path;
  patterns;
  opts;
  seen = /* @__PURE__ */ new Set();
  paused = false;
  aborted = false;
  #onResume = [];
  #ignore;
  #sep;
  signal;
  maxDepth;
  includeChildMatches;
  constructor(patterns, path2, opts) {
    this.patterns = patterns;
    this.path = path2;
    this.opts = opts;
    this.#sep = !opts.posix && opts.platform === "win32" ? "\\" : "/";
    this.includeChildMatches = opts.includeChildMatches !== false;
    if (opts.ignore || !this.includeChildMatches) {
      this.#ignore = makeIgnore(opts.ignore ?? [], opts);
      if (!this.includeChildMatches && typeof this.#ignore.add !== "function") {
        const m = "cannot ignore child matches, ignore lacks add() method.";
        throw new Error(m);
      }
    }
    this.maxDepth = opts.maxDepth || Infinity;
    if (opts.signal) {
      this.signal = opts.signal;
      this.signal.addEventListener("abort", () => {
        this.#onResume.length = 0;
      });
    }
  }
  #ignored(path2) {
    return this.seen.has(path2) || !!this.#ignore?.ignored?.(path2);
  }
  #childrenIgnored(path2) {
    return !!this.#ignore?.childrenIgnored?.(path2);
  }
  // backpressure mechanism
  pause() {
    this.paused = true;
  }
  resume() {
    if (this.signal?.aborted)
      return;
    this.paused = false;
    let fn = void 0;
    while (!this.paused && (fn = this.#onResume.shift())) {
      fn();
    }
  }
  onResume(fn) {
    if (this.signal?.aborted)
      return;
    if (!this.paused) {
      fn();
    } else {
      this.#onResume.push(fn);
    }
  }
  // do the requisite realpath/stat checking, and return the path
  // to add or undefined to filter it out.
  async matchCheck(e, ifDir) {
    if (ifDir && this.opts.nodir)
      return void 0;
    let rpc;
    if (this.opts.realpath) {
      rpc = e.realpathCached() || await e.realpath();
      if (!rpc)
        return void 0;
      e = rpc;
    }
    const needStat = e.isUnknown() || this.opts.stat;
    const s = needStat ? await e.lstat() : e;
    if (this.opts.follow && this.opts.nodir && s?.isSymbolicLink()) {
      const target = await s.realpath();
      if (target && (target.isUnknown() || this.opts.stat)) {
        await target.lstat();
      }
    }
    return this.matchCheckTest(s, ifDir);
  }
  matchCheckTest(e, ifDir) {
    return e && (this.maxDepth === Infinity || e.depth() <= this.maxDepth) && (!ifDir || e.canReaddir()) && (!this.opts.nodir || !e.isDirectory()) && (!this.opts.nodir || !this.opts.follow || !e.isSymbolicLink() || !e.realpathCached()?.isDirectory()) && !this.#ignored(e) ? e : void 0;
  }
  matchCheckSync(e, ifDir) {
    if (ifDir && this.opts.nodir)
      return void 0;
    let rpc;
    if (this.opts.realpath) {
      rpc = e.realpathCached() || e.realpathSync();
      if (!rpc)
        return void 0;
      e = rpc;
    }
    const needStat = e.isUnknown() || this.opts.stat;
    const s = needStat ? e.lstatSync() : e;
    if (this.opts.follow && this.opts.nodir && s?.isSymbolicLink()) {
      const target = s.realpathSync();
      if (target && (target?.isUnknown() || this.opts.stat)) {
        target.lstatSync();
      }
    }
    return this.matchCheckTest(s, ifDir);
  }
  matchFinish(e, absolute) {
    if (this.#ignored(e))
      return;
    if (!this.includeChildMatches && this.#ignore?.add) {
      const ign = `${e.relativePosix()}/**`;
      this.#ignore.add(ign);
    }
    const abs = this.opts.absolute === void 0 ? absolute : this.opts.absolute;
    this.seen.add(e);
    const mark = this.opts.mark && e.isDirectory() ? this.#sep : "";
    if (this.opts.withFileTypes) {
      this.matchEmit(e);
    } else if (abs) {
      const abs2 = this.opts.posix ? e.fullpathPosix() : e.fullpath();
      this.matchEmit(abs2 + mark);
    } else {
      const rel = this.opts.posix ? e.relativePosix() : e.relative();
      const pre = this.opts.dotRelative && !rel.startsWith(".." + this.#sep) ? "." + this.#sep : "";
      this.matchEmit(!rel ? "." + mark : pre + rel + mark);
    }
  }
  async match(e, absolute, ifDir) {
    const p = await this.matchCheck(e, ifDir);
    if (p)
      this.matchFinish(p, absolute);
  }
  matchSync(e, absolute, ifDir) {
    const p = this.matchCheckSync(e, ifDir);
    if (p)
      this.matchFinish(p, absolute);
  }
  walkCB(target, patterns, cb) {
    if (this.signal?.aborted)
      cb();
    this.walkCB2(target, patterns, new Processor(this.opts), cb);
  }
  walkCB2(target, patterns, processor, cb) {
    if (this.#childrenIgnored(target))
      return cb();
    if (this.signal?.aborted)
      cb();
    if (this.paused) {
      this.onResume(() => this.walkCB2(target, patterns, processor, cb));
      return;
    }
    processor.processPatterns(target, patterns);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      tasks++;
      this.match(m, absolute, ifDir).then(() => next());
    }
    for (const t of processor.subwalkTargets()) {
      if (this.maxDepth !== Infinity && t.depth() >= this.maxDepth) {
        continue;
      }
      tasks++;
      const childrenCached = t.readdirCached();
      if (t.calledReaddir())
        this.walkCB3(t, childrenCached, processor, next);
      else {
        t.readdirCB((_, entries) => this.walkCB3(t, entries, processor, next), true);
      }
    }
    next();
  }
  walkCB3(target, entries, processor, cb) {
    processor = processor.filterEntries(target, entries);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      tasks++;
      this.match(m, absolute, ifDir).then(() => next());
    }
    for (const [target2, patterns] of processor.subwalks.entries()) {
      tasks++;
      this.walkCB2(target2, patterns, processor.child(), next);
    }
    next();
  }
  walkCBSync(target, patterns, cb) {
    if (this.signal?.aborted)
      cb();
    this.walkCB2Sync(target, patterns, new Processor(this.opts), cb);
  }
  walkCB2Sync(target, patterns, processor, cb) {
    if (this.#childrenIgnored(target))
      return cb();
    if (this.signal?.aborted)
      cb();
    if (this.paused) {
      this.onResume(() => this.walkCB2Sync(target, patterns, processor, cb));
      return;
    }
    processor.processPatterns(target, patterns);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      this.matchSync(m, absolute, ifDir);
    }
    for (const t of processor.subwalkTargets()) {
      if (this.maxDepth !== Infinity && t.depth() >= this.maxDepth) {
        continue;
      }
      tasks++;
      const children = t.readdirSync();
      this.walkCB3Sync(t, children, processor, next);
    }
    next();
  }
  walkCB3Sync(target, entries, processor, cb) {
    processor = processor.filterEntries(target, entries);
    let tasks = 1;
    const next = () => {
      if (--tasks === 0)
        cb();
    };
    for (const [m, absolute, ifDir] of processor.matches.entries()) {
      if (this.#ignored(m))
        continue;
      this.matchSync(m, absolute, ifDir);
    }
    for (const [target2, patterns] of processor.subwalks.entries()) {
      tasks++;
      this.walkCB2Sync(target2, patterns, processor.child(), next);
    }
    next();
  }
};
var GlobWalker = class extends GlobUtil {
  matches = /* @__PURE__ */ new Set();
  constructor(patterns, path2, opts) {
    super(patterns, path2, opts);
  }
  matchEmit(e) {
    this.matches.add(e);
  }
  async walk() {
    if (this.signal?.aborted)
      throw this.signal.reason;
    if (this.path.isUnknown()) {
      await this.path.lstat();
    }
    await new Promise((res, rej) => {
      this.walkCB(this.path, this.patterns, () => {
        if (this.signal?.aborted) {
          rej(this.signal.reason);
        } else {
          res(this.matches);
        }
      });
    });
    return this.matches;
  }
  walkSync() {
    if (this.signal?.aborted)
      throw this.signal.reason;
    if (this.path.isUnknown()) {
      this.path.lstatSync();
    }
    this.walkCBSync(this.path, this.patterns, () => {
      if (this.signal?.aborted)
        throw this.signal.reason;
    });
    return this.matches;
  }
};
var GlobStream = class extends GlobUtil {
  results;
  constructor(patterns, path2, opts) {
    super(patterns, path2, opts);
    this.results = new Minipass({
      signal: this.signal,
      objectMode: true
    });
    this.results.on("drain", () => this.resume());
    this.results.on("resume", () => this.resume());
  }
  matchEmit(e) {
    this.results.write(e);
    if (!this.results.flowing)
      this.pause();
  }
  stream() {
    const target = this.path;
    if (target.isUnknown()) {
      target.lstat().then(() => {
        this.walkCB(target, this.patterns, () => this.results.end());
      });
    } else {
      this.walkCB(target, this.patterns, () => this.results.end());
    }
    return this.results;
  }
  streamSync() {
    if (this.path.isUnknown()) {
      this.path.lstatSync();
    }
    this.walkCBSync(this.path, this.patterns, () => this.results.end());
    return this.results;
  }
};

// node_modules/glob/dist/esm/glob.js
var defaultPlatform3 = typeof process === "object" && process && typeof process.platform === "string" ? process.platform : "linux";
var Glob = class {
  absolute;
  cwd;
  root;
  dot;
  dotRelative;
  follow;
  ignore;
  magicalBraces;
  mark;
  matchBase;
  maxDepth;
  nobrace;
  nocase;
  nodir;
  noext;
  noglobstar;
  pattern;
  platform;
  realpath;
  scurry;
  stat;
  signal;
  windowsPathsNoEscape;
  withFileTypes;
  includeChildMatches;
  /**
   * The options provided to the constructor.
   */
  opts;
  /**
   * An array of parsed immutable {@link Pattern} objects.
   */
  patterns;
  /**
   * All options are stored as properties on the `Glob` object.
   *
   * See {@link GlobOptions} for full options descriptions.
   *
   * Note that a previous `Glob` object can be passed as the
   * `GlobOptions` to another `Glob` instantiation to re-use settings
   * and caches with a new pattern.
   *
   * Traversal functions can be called multiple times to run the walk
   * again.
   */
  constructor(pattern, opts) {
    if (!opts)
      throw new TypeError("glob options required");
    this.withFileTypes = !!opts.withFileTypes;
    this.signal = opts.signal;
    this.follow = !!opts.follow;
    this.dot = !!opts.dot;
    this.dotRelative = !!opts.dotRelative;
    this.nodir = !!opts.nodir;
    this.mark = !!opts.mark;
    if (!opts.cwd) {
      this.cwd = "";
    } else if (opts.cwd instanceof URL || opts.cwd.startsWith("file://")) {
      opts.cwd = fileURLToPath2(opts.cwd);
    }
    this.cwd = opts.cwd || "";
    this.root = opts.root;
    this.magicalBraces = !!opts.magicalBraces;
    this.nobrace = !!opts.nobrace;
    this.noext = !!opts.noext;
    this.realpath = !!opts.realpath;
    this.absolute = opts.absolute;
    this.includeChildMatches = opts.includeChildMatches !== false;
    this.noglobstar = !!opts.noglobstar;
    this.matchBase = !!opts.matchBase;
    this.maxDepth = typeof opts.maxDepth === "number" ? opts.maxDepth : Infinity;
    this.stat = !!opts.stat;
    this.ignore = opts.ignore;
    if (this.withFileTypes && this.absolute !== void 0) {
      throw new Error("cannot set absolute and withFileTypes:true");
    }
    if (typeof pattern === "string") {
      pattern = [pattern];
    }
    this.windowsPathsNoEscape = !!opts.windowsPathsNoEscape || opts.allowWindowsEscape === false;
    if (this.windowsPathsNoEscape) {
      pattern = pattern.map((p) => p.replace(/\\/g, "/"));
    }
    if (this.matchBase) {
      if (opts.noglobstar) {
        throw new TypeError("base matching requires globstar");
      }
      pattern = pattern.map((p) => p.includes("/") ? p : `./**/${p}`);
    }
    this.pattern = pattern;
    this.platform = opts.platform || defaultPlatform3;
    this.opts = { ...opts, platform: this.platform };
    if (opts.scurry) {
      this.scurry = opts.scurry;
      if (opts.nocase !== void 0 && opts.nocase !== opts.scurry.nocase) {
        throw new Error("nocase option contradicts provided scurry option");
      }
    } else {
      const Scurry = opts.platform === "win32" ? PathScurryWin32 : opts.platform === "darwin" ? PathScurryDarwin : opts.platform ? PathScurryPosix : PathScurry;
      this.scurry = new Scurry(this.cwd, {
        nocase: opts.nocase,
        fs: opts.fs
      });
    }
    this.nocase = this.scurry.nocase;
    const nocaseMagicOnly = this.platform === "darwin" || this.platform === "win32";
    const mmo = {
      // default nocase based on platform
      ...opts,
      dot: this.dot,
      matchBase: this.matchBase,
      nobrace: this.nobrace,
      nocase: this.nocase,
      nocaseMagicOnly,
      nocomment: true,
      noext: this.noext,
      nonegate: true,
      optimizationLevel: 2,
      platform: this.platform,
      windowsPathsNoEscape: this.windowsPathsNoEscape,
      debug: !!this.opts.debug
    };
    const mms = this.pattern.map((p) => new Minimatch(p, mmo));
    const [matchSet, globParts] = mms.reduce((set, m) => {
      set[0].push(...m.set);
      set[1].push(...m.globParts);
      return set;
    }, [[], []]);
    this.patterns = matchSet.map((set, i) => {
      const g = globParts[i];
      if (!g)
        throw new Error("invalid pattern object");
      return new Pattern(set, g, 0, this.platform);
    });
  }
  async walk() {
    return [
      ...await new GlobWalker(this.patterns, this.scurry.cwd, {
        ...this.opts,
        maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
        platform: this.platform,
        nocase: this.nocase,
        includeChildMatches: this.includeChildMatches
      }).walk()
    ];
  }
  walkSync() {
    return [
      ...new GlobWalker(this.patterns, this.scurry.cwd, {
        ...this.opts,
        maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
        platform: this.platform,
        nocase: this.nocase,
        includeChildMatches: this.includeChildMatches
      }).walkSync()
    ];
  }
  stream() {
    return new GlobStream(this.patterns, this.scurry.cwd, {
      ...this.opts,
      maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
      platform: this.platform,
      nocase: this.nocase,
      includeChildMatches: this.includeChildMatches
    }).stream();
  }
  streamSync() {
    return new GlobStream(this.patterns, this.scurry.cwd, {
      ...this.opts,
      maxDepth: this.maxDepth !== Infinity ? this.maxDepth + this.scurry.cwd.depth() : Infinity,
      platform: this.platform,
      nocase: this.nocase,
      includeChildMatches: this.includeChildMatches
    }).streamSync();
  }
  /**
   * Default sync iteration function. Returns a Generator that
   * iterates over the results.
   */
  iterateSync() {
    return this.streamSync()[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  /**
   * Default async iteration function. Returns an AsyncGenerator that
   * iterates over the results.
   */
  iterate() {
    return this.stream()[Symbol.asyncIterator]();
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
};

// node_modules/glob/dist/esm/has-magic.js
var hasMagic = (pattern, options = {}) => {
  if (!Array.isArray(pattern)) {
    pattern = [pattern];
  }
  for (const p of pattern) {
    if (new Minimatch(p, options).hasMagic())
      return true;
  }
  return false;
};

// node_modules/glob/dist/esm/index.js
function globStreamSync(pattern, options = {}) {
  return new Glob(pattern, options).streamSync();
}
function globStream(pattern, options = {}) {
  return new Glob(pattern, options).stream();
}
function globSync(pattern, options = {}) {
  return new Glob(pattern, options).walkSync();
}
async function glob_(pattern, options = {}) {
  return new Glob(pattern, options).walk();
}
function globIterateSync(pattern, options = {}) {
  return new Glob(pattern, options).iterateSync();
}
function globIterate(pattern, options = {}) {
  return new Glob(pattern, options).iterate();
}
var streamSync = globStreamSync;
var stream = Object.assign(globStream, { sync: globStreamSync });
var iterateSync = globIterateSync;
var iterate = Object.assign(globIterate, {
  sync: globIterateSync
});
var sync = Object.assign(globSync, {
  stream: globStreamSync,
  iterate: globIterateSync
});
var glob = Object.assign(glob_, {
  glob: glob_,
  globSync,
  sync,
  globStream,
  stream,
  globStreamSync,
  streamSync,
  globIterate,
  iterate,
  globIterateSync,
  iterateSync,
  Glob,
  hasMagic,
  escape,
  unescape
});
glob.glob = glob;

// src/tools/codebase.ts
import { execFileSync } from "child_process";

// src/utils.ts
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
var FETCH_TIMEOUT_QUICK = 3e3;
var FETCH_TIMEOUT_SHORT = 5e3;
var FETCH_TIMEOUT_MEDIUM = 8e3;
var FETCH_TIMEOUT_DEFAULT = 1e4;
var FETCH_TIMEOUT_LONG = 15e3;
var FETCH_TIMEOUT_EXTENDED = 12e4;
function extractSetCookies(headers) {
  const h = headers;
  return h.getSetCookie?.() ?? [];
}
var SEVERITY_ORDER = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3
};
function findingKey(f) {
  return `${f.name}::${f.method}::${f.url}`;
}
function buildSeveritySummary(findings) {
  const bySev = {};
  for (const f of findings) {
    bySev[f.severity] = (bySev[f.severity] ?? 0) + 1;
  }
  return Object.entries(bySev).sort(([a], [b]) => (SEVERITY_ORDER[a] ?? 4) - (SEVERITY_ORDER[b] ?? 4)).map(([sev, count]) => `${count} ${sev}`).join(", ");
}
function sleep(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}
function formatTechStack(techStack) {
  const parts = [...techStack.languages, ...techStack.frameworks];
  if (techStack.databases?.length) {
    parts.push(...techStack.databases);
  }
  const stack = parts.join(", ");
  if (techStack.serviceRoot && techStack.serviceRoot !== ".") {
    return `${stack} (service: ${techStack.serviceRoot})`;
  }
  return stack;
}
function toErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}
function toDetailedErrorMessage(err) {
  if (err instanceof Error) {
    const execErr = err;
    if (execErr.stderr || execErr.stdout) {
      const stderr = String(execErr.stderr ?? "").trim();
      const stdout = String(execErr.stdout ?? "").trim();
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      if (combined.length > 0) {
        if (combined.length <= 6e3) {
          return `${err.message}
${combined}`;
        }
        const head = combined.slice(0, 2500);
        const tail = combined.slice(-3e3);
        return `${err.message}
${head}

... (${combined.length - 5500} chars omitted) ...

${tail}`;
      }
    }
    return err.message;
  }
  return String(err);
}
function extractJson(text) {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  const start = text.search(/[\[{]/);
  if (start === -1) return text;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return text.slice(start);
}
function parseJsonLenient(text) {
  try {
    return JSON.parse(text);
  } catch {
  }
  let s = text.trim();
  s = s.replace(/,\s*$/, "");
  let inStr = false;
  let lastQuoteIdx = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && inStr) {
      i++;
      continue;
    }
    if (s[i] === '"') {
      inStr = !inStr;
      if (inStr) lastQuoteIdx = i;
    }
  }
  if (inStr) {
    s = s.slice(0, lastQuoteIdx).replace(/,\s*$/, "").replace(/:\s*$/, ": null");
  }
  const closeStack = [];
  let cleaned = s;
  let inStr2 = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "\\" && inStr2) {
      i++;
      continue;
    }
    if (ch === '"') {
      inStr2 = !inStr2;
      continue;
    }
    if (inStr2) continue;
    if (ch === "{" || ch === "[") closeStack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") closeStack.pop();
  }
  if (closeStack.length > 0) {
    const lastComma = cleaned.lastIndexOf(",");
    if (lastComma > 0) {
      const candidate = cleaned.slice(0, lastComma);
      const needed = [];
      let inS = false;
      for (let i = 0; i < candidate.length; i++) {
        const ch = candidate[i];
        if (ch === "\\" && inS) {
          i++;
          continue;
        }
        if (ch === '"') {
          inS = !inS;
          continue;
        }
        if (inS) continue;
        if (ch === "{" || ch === "[") needed.push(ch === "{" ? "}" : "]");
        else if (ch === "}" || ch === "]") needed.pop();
      }
      const repaired2 = candidate + needed.reverse().join("");
      try {
        return JSON.parse(repaired2);
      } catch {
      }
    }
    const repaired = cleaned + closeStack.reverse().join("");
    try {
      return JSON.parse(repaired);
    } catch {
    }
  }
  return JSON.parse(s);
}
var SAFE_HOST_COMMANDS = /* @__PURE__ */ new Set([
  "cat",
  "ls",
  "head",
  "tail",
  "grep",
  "find",
  "wc",
  // read-only inspection
  "chmod",
  "chown",
  // permission fixes
  "sed",
  "awk",
  // text transforms
  "cp",
  "mv",
  "mkdir",
  "touch",
  "ln",
  "rm",
  // file operations
  "echo",
  "printf",
  "tee",
  // output/write
  "git",
  // version control
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  // JS package managers
  "bundle",
  "gem",
  "rake",
  // Ruby
  "pip",
  "pip3",
  "python",
  "python3",
  // Python
  "go",
  "cargo",
  "mvn",
  "gradle",
  "sbt",
  // Other build tools
  "make",
  "cmake",
  // Build systems
  "env",
  "which",
  "command",
  "type",
  "test",
  "true",
  // Shell builtins
  "sh",
  "bash",
  "zsh",
  // Subshells (for -c "...")
  "curl",
  "wget",
  // HTTP (for healthchecks)
  "kill",
  "pkill",
  // Process management
  "sleep",
  "date",
  // Utilities
  "node"
  // Node.js
]);
function isDangerousCommand(command) {
  function getFirstWord(segment) {
    return segment.trim().replace(/^(\w+=\S+\s+)*/, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  }
  const topWord = getFirstWord(command);
  if (topWord === "docker" || topWord === "docker-compose") {
    return false;
  }
  const segments = command.split(/\s*(?:\||&&|\|\|)\s*/);
  for (const seg of segments) {
    if (!seg.trim()) continue;
    const word = getFirstWord(seg);
    if (word === "docker" || word === "docker-compose") continue;
    if (!SAFE_HOST_COMMANDS.has(word)) return true;
  }
  if (/\b(curl|wget)\b.*\|\s*(sh|bash|zsh)\b/i.test(command)) {
    return true;
  }
  if (/\brm\s+-rf\s+[/~]/i.test(command)) {
    return true;
  }
  return false;
}
function runShellCommand(repoPath, command, timeoutMs = 6e4) {
  if (isDangerousCommand(command)) {
    return "Error: dangerous command blocked";
  }
  try {
    const output = execSync(command, {
      cwd: repoPath,
      encoding: "utf-8",
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      maxBuffer: 5 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const result = output.trim();
    return result.length > 1e4 ? "... [truncated beginning]\n" + result.slice(-1e4) : result || "(no output)";
  } catch (err) {
    if (err && typeof err === "object" && "killed" in err && err.killed) {
      return `Command timed out after ${Math.round(timeoutMs / 1e3)}s and was killed.`;
    }
    if (err && typeof err === "object" && "stderr" in err) {
      const errObj = err;
      const stderr = String(errObj.stderr ?? "").trim();
      const stdout = String(errObj.stdout ?? "").trim();
      return `Command failed:
${stdout}
${stderr}`.slice(-5e3);
    }
    return `Command failed: ${toErrorMessage(err)}`;
  }
}
function extractCodeBlock(text) {
  const match2 = text.match(
    /```(?:dockerfile|docker|Dockerfile|ruby|python|javascript|typescript|sh|bash|go|java|scala|kotlin|csharp|cs|yaml|yml|json|xml|toml|ini|conf|nginx|sql|text|plaintext|txt)?\s*\n([\s\S]*?)```/i
  );
  if (match2) return match2[1].trimEnd() + "\n";
  const lines = text.split("\n");
  const dockerLines = lines.filter(
    (l) => /^(FROM|RUN|COPY|ADD|WORKDIR|EXPOSE|CMD|ENTRYPOINT|ENV|ARG|LABEL|VOLUME|USER|HEALTHCHECK|SHELL|STOPSIGNAL|ONBUILD)\s/i.test(
      l.trim()
    ) || l.trim() === "" || l.trim().startsWith("#")
  );
  if (dockerLines.length >= 3) return dockerLines.join("\n") + "\n";
  return null;
}
function stripHtmlForAnalysis(html) {
  const stripped = html.replace(
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>[\s\S]*?<\/script>/gi,
    (_m, src) => ` [script: ${src}] `
  ).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(
    /<(app-root|consumer-root|next-root|nuxt|div\s+id\s*=\s*["'](?:root|app|__next|__nuxt)["'])[^>]*>/gi,
    (_m, tag) => ` [SPA root: <${tag}>] `
  ).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s{2,}/g, " ").trim();
  return stripped;
}
var PROBE_RESPONSE_DIR = "/tmp/bright_probe_responses";
var _probeCounter = 0;
function saveProbeBody(bodyText, contentType) {
  if (bodyText.length <= 2e3) return null;
  try {
    mkdirSync(PROBE_RESPONSE_DIR, { recursive: true });
  } catch {
  }
  const ext2 = contentType.includes("json") ? "json" : contentType.includes("html") ? "html" : "txt";
  const filePath = `${PROBE_RESPONSE_DIR}/response_${++_probeCounter}.${ext2}`;
  try {
    writeFileSync(filePath, bodyText, "utf-8");
    return filePath;
  } catch {
    return null;
  }
}
function injectEnvVarsFromHint(repoPath, hint) {
  const envPattern = /\b([A-Z][A-Z0-9_]{2,})=("([^"]*)"|'([^']*)'|(\S+))/g;
  const envVars = [];
  let m;
  while ((m = envPattern.exec(hint)) !== null) {
    const key = m[1];
    const value = m[3] ?? m[4] ?? m[5];
    envVars.push([key, value]);
  }
  if (envVars.length === 0) return [];
  const composePaths = [
    join(repoPath, "docker-compose.yml"),
    join(repoPath, "docker-compose.yaml"),
    join(repoPath, "compose.yml"),
    join(repoPath, "compose.yaml")
  ];
  const composePath = composePaths.find((p) => existsSync(p));
  if (!composePath) return [];
  let content = readFileSync(composePath, "utf-8");
  const injected = [];
  for (const [key, value] of envVars) {
    if (content.includes(`${key}=`) || content.includes(`${key}:`)) continue;
    const envBlockMatch = content.match(/^(\s*)environment:\s*$/m) ?? content.match(/^(\s*)environment:\s*\n/m);
    if (envBlockMatch) {
      const indent = envBlockMatch[1] + "  ";
      const insertPos = (envBlockMatch.index ?? 0) + envBlockMatch[0].length;
      const envLine = `${indent}- ${key}=${value}
`;
      content = content.slice(0, insertPos) + envLine + content.slice(insertPos);
      injected.push(`${key}=${value}`);
    }
  }
  if (injected.length > 0) {
    writeFileSync(composePath, content, "utf-8");
    console.log(`[Utils] Injected env vars into ${composePath}: ${injected.join(", ")}`);
  }
  return injected;
}

// src/tools/codebase.ts
var codebaseTools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file from the repository. Returns the full file text.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative file path from the repository root (e.g. src/app.ts)"
          }
        },
        required: ["path"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files matching a glob pattern in the repository. Returns newline-separated file paths.",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: 'Glob pattern relative to the repo root (e.g. "src/**/*.ts", "*.json")'
          }
        },
        required: ["pattern"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search file contents for a pattern using grep. Returns matching lines with file paths and line numbers. Supports both fixed text and regex patterns.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search pattern (fixed text by default, or regex if regex=true)"
          },
          glob: {
            type: "string",
            description: 'Optional glob to restrict search to certain files (e.g. "*.ts")'
          },
          regex: {
            type: "boolean",
            description: "If true, treat query as a regular expression instead of fixed text. Useful for searching patterns like 'authenticate|authorize|login'."
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  }
];
function createToolHandler(repoPath) {
  return async (name, args) => {
    switch (name) {
      case "read_file": {
        const rawPath = String(args.path ?? "");
        const filePath = rawPath.startsWith("/") ? resolve(rawPath) : resolve(repoPath, rawPath);
        if (!filePath.startsWith(repoPath) && !filePath.startsWith(PROBE_RESPONSE_DIR + "/")) {
          return "Error: path traversal attempt blocked";
        }
        if (!existsSync2(filePath)) {
          return `Error: file not found: ${args.path}`;
        }
        if (statSync(filePath).isDirectory()) {
          return `Error: path is a directory, not a file: ${args.path}`;
        }
        const content = readFileSync2(filePath, "utf-8");
        if (content.length > 5e4) {
          return content.slice(0, 5e4) + "\n... [truncated at 50000 chars]";
        }
        return content;
      }
      case "list_files": {
        const pattern = String(args.pattern ?? "**/*");
        const files = await glob(pattern, {
          cwd: repoPath,
          nodir: true,
          ignore: [
            "node_modules/**",
            ".git/**",
            "dist/**",
            "build/**",
            "vendor/**",
            ".data/**"
          ]
        });
        if (files.length === 0) return "No files found matching that pattern.";
        if (files.length > 200) {
          return files.slice(0, 200).join("\n") + `
... and ${files.length - 200} more`;
        }
        return files.join("\n");
      }
      case "search_files": {
        const query = String(args.query ?? "");
        const fileGlob = args.glob ? String(args.glob) : void 0;
        const useRegex = args.regex === true;
        try {
          const grepArgs = [
            "-rn",
            "--binary-files=without-match",
            "--include",
            fileGlob ?? "*",
            "--exclude-dir=node_modules",
            "--exclude-dir=.git",
            "--exclude-dir=dist",
            "--exclude-dir=build",
            "--exclude-dir=vendor",
            "--exclude-dir=.data",
            "--exclude-dir=data",
            "--exclude=*.min.js",
            "--exclude=*.min.css",
            "--exclude=*.bundle.js",
            "--exclude=*.chunk.js",
            "--exclude=*.map",
            ...useRegex ? ["-E"] : ["-F"],
            "--",
            query,
            "."
          ];
          const output = execFileSync("grep", grepArgs, {
            cwd: repoPath,
            encoding: "utf-8",
            maxBuffer: 1024 * 1024,
            timeout: 1e4
          });
          const MAX_LINES = 100;
          const MAX_LINE_LENGTH = 500;
          const MAX_TOTAL_CHARS = 3e4;
          const rawLines = output.trim().split("\n");
          const totalCount = rawLines.length;
          const truncatedLines = [];
          let totalChars = 0;
          for (let i = 0; i < Math.min(totalCount, MAX_LINES); i++) {
            let line = rawLines[i];
            if (line.length > MAX_LINE_LENGTH) {
              line = line.slice(0, MAX_LINE_LENGTH) + "\u2026 [truncated]";
            }
            if (totalChars + line.length > MAX_TOTAL_CHARS) {
              truncatedLines.push(`... [output truncated at ${MAX_TOTAL_CHARS} chars]`);
              break;
            }
            truncatedLines.push(line);
            totalChars += line.length + 1;
          }
          if (totalCount > MAX_LINES) {
            truncatedLines.push(`... and ${totalCount - MAX_LINES} more matches`);
          }
          return truncatedLines.join("\n");
        } catch {
          return "No matches found.";
        }
      }
      default:
        return `Error: unknown tool ${name}`;
    }
  };
}

// src/tools/probe.ts
var probeUrlTool = {
  type: "function",
  function: {
    name: "probe_url",
    description: "Make an HTTP request to a URL and return the status code, headers, and response body. Use this to check if the application is responding, diagnose 500 errors, test endpoints, etc.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Full URL to probe (e.g. http://localhost:3000/)"
        },
        method: {
          type: "string",
          description: "HTTP method (GET, POST, PUT, etc.). Defaults to GET."
        },
        headers: {
          type: "string",
          description: `Optional JSON object of headers (e.g. '{"Content-Type": "application/json"}')`
        },
        body: {
          type: "string",
          description: "Optional request body for POST/PUT requests"
        }
      },
      required: ["url"],
      additionalProperties: false
    }
  }
};
async function probeUrl(args) {
  const url = String(args.url ?? "");
  if (!url) return "Error: url parameter is required";
  const method = String(args.method ?? "GET").toUpperCase();
  let extraHeaders = {};
  if (args.headers) {
    try {
      extraHeaders = JSON.parse(String(args.headers));
    } catch {
      return "Error: invalid JSON in headers parameter";
    }
  }
  const fetchOpts = {
    method,
    headers: {
      Accept: "application/json, text/html, */*",
      ...extraHeaders
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG)
  };
  if (args.body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    fetchOpts.body = String(args.body);
  }
  try {
    console.log(`[Tool] probe_url: ${method} ${url}`);
    const res = await fetch(url, fetchOpts);
    const status = res.status;
    const headerLines = [];
    for (const [k, v] of res.headers.entries()) {
      const lk = k.toLowerCase();
      if (lk === "content-type" || lk === "location" || lk === "set-cookie" || lk === "www-authenticate" || lk === "x-csrf-token") {
        headerLines.push(`${k}: ${v}`);
      }
    }
    const bodyText = await res.text().catch(() => "");
    const bodyPreview = bodyText.length > 2e3 ? bodyText.slice(0, 2e3) + "\n... [truncated]" : bodyText;
    const parts = [`HTTP ${status}`];
    if (headerLines.length > 0) parts.push(headerLines.join("\n"));
    parts.push(bodyPreview || "(empty body)");
    const contentType = res.headers.get("content-type") ?? "";
    const savedPath = saveProbeBody(bodyText, contentType);
    if (savedPath) {
      parts.push(`
\u{1F4C4} Full response body (${bodyText.length} bytes) saved to: ${savedPath}
Use read_file to inspect for errors, setup instructions, or configuration requirements.`);
    }
    console.log(`[Tool] probe_url result: ${status}`);
    return parts.join("\n\n");
  } catch (err) {
    const msg = toErrorMessage(err);
    console.log(`[Tool] probe_url error: ${msg}`);
    return `Error: ${msg}`;
  }
}

// src/tools/web.ts
import { writeFileSync as writeFileSync2 } from "fs";
import { resolve as resolve2 } from "path";
function htmlToText(html) {
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|dt|dd|blockquote|pre|section|article)>/gi, "\n");
  text = text.replace(/<br[^>]*\/?>/gi, "\n");
  text = text.replace(/<hr[^>]*\/?>/gi, "\n---\n");
  text = text.replace(/<[^>]*>/g, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n[ \t]+/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
async function searchWeb(query) {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
          Accept: "text/html"
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG)
      }
    );
    if (!res.ok) return `Search failed (HTTP ${res.status})`;
    const html = await res.text();
    const blocks = html.split(/class="result\s/);
    const results = [];
    for (const block of blocks.slice(1, 8)) {
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const title = titleMatch ? htmlToText(titleMatch[1]).trim() : "";
      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/);
      let url = hrefMatch ? hrefMatch[1] : "";
      const uddgMatch = url.match(/[?&]uddg=([^&]*)/);
      if (uddgMatch) url = decodeURIComponent(uddgMatch[1]);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch ? htmlToText(snippetMatch[1]).trim() : "";
      if (title && (snippet || url)) {
        results.push(`${results.length + 1}. ${title}
   ${url}
   ${snippet}`);
      }
    }
    if (results.length === 0) return "No search results found. Try rephrasing the query.";
    return results.join("\n\n");
  } catch (err) {
    return `Search error: ${toErrorMessage(err)}`;
  }
}
var FETCH_INLINE_LIMIT = 1500;
var FETCH_FILE_LIMIT = 2e4;
async function fetchUrlContent(targetUrl, repoPath) {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        Accept: "text/html, text/plain, application/json, */*"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG)
    });
    if (!res.ok) return `Failed to fetch (HTTP ${res.status})`;
    const contentType = res.headers.get("content-type") || "";
    const body = await res.text();
    let text;
    if (contentType.includes("text/plain") || contentType.includes("application/json")) {
      text = body;
    } else {
      text = htmlToText(body);
    }
    if (text.length > FETCH_FILE_LIMIT) {
      text = text.slice(0, FETCH_FILE_LIMIT) + "\n... [truncated at 20 000 chars]";
    }
    if (text.length <= FETCH_INLINE_LIMIT) {
      return text;
    }
    if (repoPath) {
      const filePath = resolve2(repoPath, ".bright-fetched-page.txt");
      writeFileSync2(filePath, text, "utf-8");
      const preview = text.slice(0, 800);
      return `Content saved to .bright-fetched-page.txt (${text.length} chars). Use read_file to see the full page.

Preview:
${preview}
...`;
    }
    return text.slice(0, 3e3) + "\n... [truncated \u2014 content too large for inline]";
  } catch (err) {
    return `Fetch error: ${toErrorMessage(err)}`;
  }
}
var searchWebTool = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the public web for technical solutions. Use for public OSS docs, framework/package behavior, OS package names, version-specific configuration, or generic error messages. Do NOT search for private/local repository paths, selected monorepo service names, or internal code identifiers; inspect the codebase for those instead. Returns top results with titles and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: 'Public technical search query without local repo paths (e.g. "install imagemagick 7 debian bookworm", "fix Pitchfork::BootFailure rails 7", "postgresql 16 apt repository ubuntu 24.04")'
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
};
var fetchUrlTool = {
  type: "function",
  function: {
    name: "fetch_url",
    description: "Fetch a web page and return its text content. Use after search_web to read the full content of a promising result (e.g. a Stack Overflow answer, documentation page, or GitHub issue). Returns page text with HTML stripped.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to fetch (from search_web results or known documentation)"
        }
      },
      required: ["url"],
      additionalProperties: false
    }
  }
};
var webSearchTools = [searchWebTool, fetchUrlTool];
function looksLikeInternalCodeSearch(query) {
  return /(?:^|\s|["'`])(?:\.\/)?(?:apps|packages|services|libs|modules)\/[A-Za-z0-9._/-]+/i.test(query) || /(?:^|\s|["'`])(?:\/tmp\/|\/home\/|\/workspace\/|\/workspaces\/|\/app\/)[^\s"'`]+/i.test(query);
}
function createWebSearchHandler(repoPath) {
  return async (name, args) => {
    if (name === "search_web") {
      const query = String(args.query ?? "").trim();
      if (!query) return "Error: query parameter is required";
      if (looksLikeInternalCodeSearch(query)) {
        console.log(`[Tool] search_web skipped internal query: ${query}`);
        return [
          "Search skipped: this query appears to contain a local/private repository path or internal monorepo service name.",
          "Use codebase tools (list_files/read_file/search_files) for internal paths.",
          'If public web search is still needed, reformulate using a public OSS project/framework/package name or a generic error, for example "NestJS Docker pnpm monorepo production build" or "rails ENOENT magick binary".'
        ].join("\n");
      }
      console.log(`[Tool] search_web: ${query}`);
      return searchWeb(query);
    }
    if (name === "fetch_url") {
      const url = String(args.url ?? "").trim();
      if (!url) return "Error: url parameter is required";
      console.log(`[Tool] fetch_url: ${url.slice(0, 200)}`);
      return fetchUrlContent(url, repoPath);
    }
    return `Unknown tool: ${name}`;
  };
}

// src/tools/docker.ts
var verifyDockerImageTool = {
  type: "function",
  function: {
    name: "verify_docker_image",
    description: "Check if a Docker image:tag exists on Docker Hub. Use this BEFORE writing FROM lines to ensure the image tag is valid. Returns 'exists' or 'not found'.",
    parameters: {
      type: "object",
      properties: {
        image: {
          type: "string",
          description: 'Full image reference (e.g. "node:22-bookworm-slim", "sbtscala/scala-sbt:eclipse-temurin-jammy-21.0.6_7_1.10.11_3.6.4")'
        }
      },
      required: ["image"],
      additionalProperties: false
    }
  }
};
var dockerfileTools = [
  ...codebaseTools,
  verifyDockerImageTool
];
function parseImageRef(imageRef) {
  const segments = imageRef.split("/");
  let registry = null;
  let repoParts;
  if (segments.length > 1 && (segments[0].includes(".") || segments[0].includes(":"))) {
    registry = segments[0];
    repoParts = segments.slice(1);
  } else {
    repoParts = segments;
  }
  const last = repoParts[repoParts.length - 1];
  const colonIdx = last.lastIndexOf(":");
  let tag = "latest";
  if (colonIdx !== -1) {
    tag = last.substring(colonIdx + 1);
    repoParts[repoParts.length - 1] = last.substring(0, colonIdx);
  }
  return { registry, repo: repoParts.join("/"), tag };
}
async function verifyDockerImage(imageRef) {
  const { registry, repo, tag } = parseImageRef(imageRef);
  if (registry) {
    return verifyOciImage(`${registry}/${repo}`, tag);
  }
  const hubRepo = repo.includes("/") ? repo : `library/${repo}`;
  const url = `https://hub.docker.com/v2/repositories/${hubRepo}/tags/${tag}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
      headers: { Accept: "application/json" }
    });
    return res.ok;
  } catch {
    return true;
  }
}
async function verifyOciImage(imagePart, tag) {
  const segments = imagePart.split("/");
  const registry = segments[0];
  const repo = segments.slice(1).join("/");
  const url = `https://${registry}/v2/${repo}/manifests/${tag}`;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT),
      headers: {
        Accept: [
          "application/vnd.docker.distribution.manifest.v2+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.oci.image.index.v1+json"
        ].join(", ")
      }
    });
    return res.ok;
  } catch {
    return true;
  }
}
function createDockerfileToolHandler(repoPath) {
  const baseHandler = createToolHandler(repoPath);
  return async (name, args) => {
    if (name === "verify_docker_image") {
      const image = String(args.image ?? "");
      if (!image) return "Error: image parameter is required";
      const exists = await verifyDockerImage(image);
      return exists ? `\u2713 Image "${image}" exists on Docker Hub` : `\u2717 Image "${image}" NOT FOUND on Docker Hub. Try a different tag.`;
    }
    return baseHandler(name, args);
  };
}
async function validateDockerfileImages(dockerfile) {
  const fromRe = /^FROM\s+(\S+)/gmi;
  const images = /* @__PURE__ */ new Set();
  let m;
  while ((m = fromRe.exec(dockerfile)) !== null) {
    const img = m[1];
    if (img.startsWith("$") || img === "scratch") continue;
    if (!img.includes("/") && !img.includes(":") && img === img.toLowerCase()) {
      const officialPrefixes = ["node", "python", "golang", "ruby", "rust", "openjdk", "eclipse-temurin", "amazoncorretto", "maven", "gradle", "php", "nginx", "alpine", "ubuntu", "debian"];
      if (!officialPrefixes.some((p) => img.startsWith(p))) continue;
    }
    images.add(img);
  }
  const missing = [];
  for (const img of images) {
    const exists = await verifyDockerImage(img);
    if (!exists) {
      missing.push(img);
      console.warn(`[Startup] Docker image not found: ${img}`);
    }
  }
  return missing;
}
async function findAlternativeImage(badRef) {
  const { registry, repo, tag: badTag } = parseImageRef(badRef);
  const imagePart = registry ? `${registry}/${repo}` : repo;
  const candidates = [];
  if (badTag.endsWith("-slim")) {
    candidates.push(`${imagePart}:${badTag.replace(/-slim$/, "")}`);
  } else {
    candidates.push(`${imagePart}:${badTag}-slim`);
  }
  const parts = badTag.split("-");
  if (parts.length >= 3) {
    candidates.push(`${imagePart}:${parts[0]}-${parts[parts.length - 1]}`);
    candidates.push(`${imagePart}:${parts[0]}`);
  }
  if (parts.length >= 2) {
    candidates.push(`${imagePart}:${parts[0]}`);
  }
  const versionMatch = badTag.match(/^(\d+\.\d+)/);
  if (versionMatch) {
    candidates.push(`${imagePart}:${versionMatch[1]}`);
  }
  const seen = /* @__PURE__ */ new Set([badRef]);
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (await verifyDockerImage(candidate)) {
      return candidate;
    }
  }
  return null;
}
async function fixDockerfileImages(dockerfile) {
  const missing = await validateDockerfileImages(dockerfile);
  if (missing.length === 0) return dockerfile;
  let patched = dockerfile;
  for (const bad of missing) {
    const alt = await findAlternativeImage(bad);
    if (alt) {
      console.log(`[Startup] Auto-fixing Docker image: ${bad} \u2192 ${alt}`);
      patched = patched.split(bad).join(alt);
    } else {
      console.warn(`[Startup] No alternative found for Docker image: ${bad}`);
    }
  }
  return patched;
}

// src/tools/infra.ts
import { readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { resolve as resolve3 } from "path";
import { execSync as execSync2 } from "child_process";

// src/hints.ts
var ALL_STAGES = [
  "startup",
  "setup",
  "scan_prep",
  "auth",
  "entrypoints",
  "test_selection",
  "scan",
  "fix",
  "discovery",
  "credentials",
  "infra"
];
var STAGE_SET = new Set(ALL_STAGES);
function isStage(value) {
  return typeof value === "string" && STAGE_SET.has(value);
}
var STAGE_DESCRIPTIONS = {
  startup: "Building/booting the application \u2014 Dockerfile, compose, ports, build commands.",
  setup: "First-run application setup \u2014 admin user creation, schema bootstrap, post-start init.",
  scan_prep: "Pre-scan tweaks \u2014 relaxing rate limits, disabling 2FA, raising throttle ceilings.",
  auth: "Auth detection and configuration \u2014 login endpoints, token shape, OAuth flow specifics.",
  entrypoints: "Endpoint registration with Bright \u2014 discovered routes, parameter shapes.",
  test_selection: "Per-endpoint security test choices.",
  scan: "Active DAST scan execution.",
  fix: "Vulnerability remediation patches.",
  discovery: "Cross-cutting facts about the app/stack \u2014 tech stack, services, ports.",
  credentials: "Test user / API key / OAuth client credentials reusable across phases.",
  infra: "Infrastructure repair instructions \u2014 env vars to set, packages to install, image to swap."
};
var HINT_MAX_LENGTH = 900;
function compactHint(text, max = HINT_MAX_LENGTH) {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}
function isDuplicate(a, b) {
  return a === b || a.includes(b) || b.includes(a);
}
function parseLegacyHint(line) {
  const m = line.match(/^\s*\[([a-z][a-z0-9_-]*)\]\s*(.*)$/i);
  if (!m) return { stage: "discovery", text: compactHint(line) };
  const tag = m[1].toLowerCase();
  const body = m[2];
  const map = [
    [/^auth-infra/, "infra"],
    [/^auth/, "auth"],
    [/^scan-prep/, "scan_prep"],
    [/^scan/, "scan"],
    [/^setup-credentials/, "credentials"],
    [/^setup-infra/, "infra"],
    [/^setup/, "setup"],
    [/^startup/, "startup"],
    [/^entrypoints?/, "entrypoints"],
    [/^test-selection/, "test_selection"],
    [/^fix/, "fix"],
    [/^infra/, "infra"],
    [/^credentials/, "credentials"],
    [/^discovery/, "discovery"]
  ];
  for (const [re, stage] of map) {
    if (re.test(tag)) return { stage, text: compactHint(body || line) };
  }
  return { stage: "discovery", text: compactHint(line) };
}
var HintStore = class _HintStore {
  buckets = /* @__PURE__ */ new Map();
  /** Add a hint to a stage bucket. Returns true if stored, false if a duplicate. */
  add(stage, text) {
    const compact = compactHint(text);
    if (!compact) return false;
    const bucket = this.buckets.get(stage) ?? [];
    if (bucket.some((existing) => isDuplicate(existing, compact))) return false;
    bucket.push(compact);
    this.buckets.set(stage, bucket);
    return true;
  }
  /** Remove a hint from a stage by exact text or distinctive substring. */
  remove(stage, needle) {
    const bucket = this.buckets.get(stage);
    if (!bucket || bucket.length === 0) return false;
    const compact = compactHint(needle);
    if (!compact) return false;
    const idx = bucket.findIndex((existing) => isDuplicate(existing, compact));
    if (idx === -1) return false;
    bucket.splice(idx, 1);
    if (bucket.length === 0) this.buckets.delete(stage);
    return true;
  }
  /** True if there's at least one hint in the requested stage. */
  has(stage) {
    const b = this.buckets.get(stage);
    return !!b && b.length > 0;
  }
  /** Hint count: total when no stage given, per-stage when given. */
  count(stage) {
    if (stage) return this.buckets.get(stage)?.length ?? 0;
    let total = 0;
    for (const b of this.buckets.values()) total += b.length;
    return total;
  }
  /** Stages that currently hold at least one hint, in canonical order. */
  stages() {
    return ALL_STAGES.filter((s) => this.has(s));
  }
  /**
   * Read hints. When `stages` is provided, only those buckets are returned.
   * Otherwise every non-empty bucket is returned. Order follows ALL_STAGES.
   */
  get(stages) {
    const filter2 = stages ? /* @__PURE__ */ new Set([...stages]) : null;
    const out = [];
    for (const stage of ALL_STAGES) {
      if (filter2 && !filter2.has(stage)) continue;
      const bucket = this.buckets.get(stage);
      if (!bucket) continue;
      for (const text of bucket) out.push({ stage, text });
    }
    return out;
  }
  /**
   * Format hints as a prompt block. Empty if no hints match. The block is
   * grouped by stage so the LLM sees the same structure on every prompt.
   *
   * Example:
   *
   *   ## Saved hints
   *   ### auth
   *   - [#1] OAuth2 token endpoint: …
   *   ### scan_prep
   *   - [#1] Rate limiting was relaxed in the NestJS guard …
   */
  format(stages, heading = "## Saved hints") {
    const filter2 = stages ? /* @__PURE__ */ new Set([...stages]) : null;
    const sections = [];
    for (const stage of ALL_STAGES) {
      if (filter2 && !filter2.has(stage)) continue;
      const bucket = this.buckets.get(stage);
      if (!bucket || bucket.length === 0) continue;
      const lines = bucket.map((h, i) => `- [#${i + 1}] ${h}`);
      sections.push(`### ${stage}
${lines.join("\n")}`);
    }
    if (sections.length === 0) return "";
    return `${heading}
${sections.join("\n\n")}`;
  }
  /**
   * Flat list of `[stage] body` strings. Lets call sites that still expect
   * the legacy shape (e.g. third-party prompt builders) keep working.
   */
  toLegacyArray(stages) {
    return this.get(stages).map(({ stage, text }) => `[${stage}] ${text}`);
  }
  /** Build a HintStore from the legacy `[tag] body` flat-array format. */
  static fromLegacyArray(lines) {
    const store = new _HintStore();
    for (const line of lines) {
      const { stage, text } = parseLegacyHint(line);
      store.add(stage, text);
    }
    return store;
  }
};

// src/tools/unified.ts
function buildToolDefs(opts) {
  const tools = [...codebaseTools];
  if (opts.enableDockerVerify) tools.push(verifyDockerImageTool);
  if (opts.enableEdit) tools.push(editFileTool);
  if (opts.enableShell) tools.push(runCommandOnHostTool);
  if (opts.enableDocker) tools.push(runCommandInDockerTool);
  if (opts.enableProbe) tools.push(probeUrlTool);
  if (opts.enableWeb) tools.push(...webSearchTools);
  if (opts.enableHints) {
    tools.push(saveHintTool, removeHintTool, getHintsTool);
  }
  return tools;
}
function resolveStage(args, defaultStage) {
  const raw = args.stage;
  if (typeof raw === "string" && isStage(raw)) return raw;
  if (defaultStage) return defaultStage;
  return null;
}
function handleHintTool(name, args, opts) {
  const label = opts.label ?? "Tool";
  switch (name) {
    case "save_hint": {
      const hint = String(args.hint ?? "").trim();
      if (!hint) return "Error: hint cannot be empty";
      const stage = resolveStage(args, opts.defaultStage);
      if (!stage) {
        return `Error: stage is required. Available stages: ${ALL_STAGES.join(", ")}`;
      }
      const stored = opts.hints?.add(stage, hint) ?? false;
      console.log(`[${label}] save_hint [${stage}]: ${hint.slice(0, 200)}`);
      if (opts.onHint) opts.onHint(stage, hint);
      return stored ? `Hint saved under stage "${stage}". It will be available to the next attempt.` : `Hint already covered by an existing entry under stage "${stage}" (no change).`;
    }
    case "remove_hint": {
      const hint = String(args.hint ?? "").trim();
      if (!hint) return "Error: hint cannot be empty";
      const stage = resolveStage(args, opts.defaultStage);
      if (!stage) {
        return `Error: stage is required. Available stages: ${ALL_STAGES.join(", ")}`;
      }
      const removed = opts.hints?.remove(stage, hint) ?? false;
      console.log(`[${label}] remove_hint [${stage}]: ${hint.slice(0, 200)}`);
      if (opts.onRemoveHint) opts.onRemoveHint(stage, hint);
      return removed ? `Hint removed from stage "${stage}".` : `No matching hint found in stage "${stage}".`;
    }
    case "get_hints": {
      const store = opts.hints;
      if (!store) return "No hints available (hint store not configured for this phase).";
      const stageArg = args.stage;
      if (stageArg == null || stageArg === "" || stageArg === "all") {
        const stages = store.stages();
        if (stages.length === 0) return "No hints saved yet.";
        const lines = stages.map((s) => `- ${s}: ${store.count(s)} hint(s) \u2014 ${STAGE_DESCRIPTIONS[s]}`);
        return [
          `Available hint stages (${stages.length} of ${ALL_STAGES.length} populated):`,
          ...lines,
          "",
          'Call get_hints with stage="<name>" to read a specific stage, or stage="all" for everything.'
        ].join("\n");
      }
      if (typeof stageArg === "string" && isStage(stageArg)) {
        const block = store.format([stageArg], `## Hints for stage "${stageArg}"`);
        return block || `No hints saved for stage "${stageArg}" yet.`;
      }
      return `Error: unknown stage "${String(stageArg)}". Available stages: ${ALL_STAGES.join(", ")}`;
    }
  }
  return null;
}
function createUnifiedToolHandler(repoPath, opts) {
  const codeHandler = createToolHandler(repoPath);
  const webHandler = opts.enableWeb ? createWebSearchHandler(repoPath) : void 0;
  const dockerfileHandler = opts.enableDockerVerify ? createDockerfileToolHandler(repoPath) : void 0;
  return async (name, args) => {
    switch (name) {
      // --- Codebase tools (always on) ---
      case "read_file":
      case "list_files":
      case "search_files":
        return codeHandler(name, args);
      // --- Docker image verification ---
      case "verify_docker_image":
        if (!opts.enableDockerVerify || !dockerfileHandler) break;
        return dockerfileHandler(name, args);
      // --- Shell command ---
      case "run_command_on_host": {
        if (!opts.enableShell) break;
        const command = String(args.command ?? "");
        if (opts.shellGuard) {
          const blocked = opts.shellGuard(command);
          if (blocked) {
            console.warn(`[${opts.label ?? "Tool"}] BLOCKED command: ${command.slice(0, 120)}`);
            return blocked;
          }
        }
        console.log(`[${opts.label ?? "Tool"}] run_command_on_host: ${command.slice(0, 200)}`);
        return runShellCommand(repoPath, command, 12e4);
      }
      // --- Docker exec ---
      case "run_command_in_docker": {
        if (!opts.enableDocker) break;
        const container = String(args.container ?? "");
        const cmd = String(args.command ?? "");
        console.log(`[${opts.label ?? "Tool"}] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
        const result = execInDocker(repoPath, container, cmd, 12e4);
        if (opts.onDocker) opts.onDocker(container, cmd, result);
        return result;
      }
      // --- Edit file ---
      case "edit_file": {
        if (!opts.enableEdit) break;
        const result = handleEditFile(repoPath, args);
        if (opts.onEdit) opts.onEdit(args, result);
        return result;
      }
      // --- Probe URL ---
      case "probe_url": {
        if (!opts.enableProbe) break;
        const result = opts.customProbe ? await opts.customProbe(args) : await probeUrl(args);
        if (opts.onProbe) opts.onProbe(args, result);
        return result;
      }
      // --- Web search ---
      case "search_web":
      case "fetch_url": {
        if (!opts.enableWeb || !webHandler) break;
        return webHandler(name, args);
      }
      // --- Hints (delegated to the shared dispatcher) ---
      case "save_hint":
      case "remove_hint":
      case "get_hints": {
        if (!opts.enableHints) break;
        const out = handleHintTool(name, args, {
          hints: opts.hints,
          defaultStage: opts.defaultStage,
          label: opts.label,
          onHint: opts.onHint,
          onRemoveHint: opts.onRemoveHint
        });
        if (out !== null) return out;
        break;
      }
      // --- Wait ---
      case "wait": {
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)));
        console.log(`[${opts.label ?? "Tool"}] wait: ${seconds}s`);
        await new Promise((r) => setTimeout(r, seconds * 1e3));
        return `Waited ${seconds} seconds`;
      }
    }
    return `Error: unknown tool ${name}`;
  };
}
var stageEnumDescription = ALL_STAGES.map((s) => `"${s}" \u2014 ${STAGE_DESCRIPTIONS[s]}`).join(" | ");
var saveHintTool = {
  type: "function",
  function: {
    name: "save_hint",
    description: `Save a concise factual hint discovered during this attempt so it carries into the NEXT attempt or sibling phase. Each hint is filed under a stage bucket. Pick the stage that BEST describes what the hint applies to. Available stages: ${stageEnumDescription}`,
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description: "A concise factual statement (\u2264900 chars) about the application's configuration, dependencies, or behavior."
        },
        stage: {
          type: "string",
          enum: [...ALL_STAGES],
          description: "Which stage bucket to file this hint under. If omitted, the calling phase's default stage is used."
        }
      },
      required: ["hint"],
      additionalProperties: false
    }
  }
};
var removeHintTool = {
  type: "function",
  function: {
    name: "remove_hint",
    description: "Remove a previously saved hint that turned out to be WRONG or MISLEADING. Pass the exact hint text or a distinctive substring.",
    parameters: {
      type: "object",
      properties: {
        hint: {
          type: "string",
          description: "Exact text or distinctive substring of the hint to remove."
        },
        stage: {
          type: "string",
          enum: [...ALL_STAGES],
          description: "Which stage bucket to remove from. If omitted, the calling phase's default stage is used."
        }
      },
      required: ["hint"],
      additionalProperties: false
    }
  }
};
var getHintsTool = {
  type: "function",
  function: {
    name: "get_hints",
    description: `List which hint stages are populated, or read the hints in a specific stage. Call with no arguments (or stage='all') to see counts per stage; call with stage='<name>' to read that stage's hints. Available stages: ${ALL_STAGES.join(", ")}.`,
    parameters: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: [...ALL_STAGES, "all"],
          description: "Stage bucket to read. Omit (or use 'all') to get a summary of every stage with hint counts."
        }
      },
      additionalProperties: false
    }
  }
};

// src/tools/infra.ts
var writeFileTool = {
  type: "function",
  function: {
    name: "write_file",
    description: "Write content to a file (create or overwrite). Use this to patch shell scripts, compose files, config files, etc.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path from the repository root (e.g. bin/docker/exec)"
        },
        content: {
          type: "string",
          description: "The full file content to write"
        }
      },
      required: ["path", "content"],
      additionalProperties: false
    }
  }
};
var editFileTool = {
  type: "function",
  function: {
    name: "edit_file",
    description: "Make a targeted edit to a file by replacing an exact string match. Much safer than write_file for small changes \u2014 you don't need to rewrite the entire file. The old_string must match EXACTLY one occurrence in the file (including whitespace/indentation).",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative file path from the repository root (e.g. compose.yml, Dockerfile)"
        },
        old_string: {
          type: "string",
          description: "The exact string to find in the file. Must match exactly one occurrence. Include enough surrounding context (a few lines) to ensure uniqueness."
        },
        new_string: {
          type: "string",
          description: "The replacement string. Can be empty to delete the matched text."
        }
      },
      required: ["path", "old_string", "new_string"],
      additionalProperties: false
    }
  }
};
var runCommandOnHostTool = {
  type: "function",
  function: {
    name: "run_command_on_host",
    description: "Run a shell command on the HOST machine (not inside a Docker container). Use for host-level diagnostics (docker ps, docker logs, docker inspect, ls, cat), builds (docker build, docker compose build), or small file fixes (sed, chmod). Commands are killed after 120 seconds.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: `Host shell command (e.g. "docker logs myapp --tail 50", "docker build -t myapp .", "sed -i 's/old/new/g' config.yml")`
        }
      },
      required: ["command"],
      additionalProperties: false
    }
  }
};
var runCommandInDockerTool = {
  type: "function",
  function: {
    name: "run_command_in_docker",
    description: "Run a command INSIDE a Docker container. Use this to inspect the container environment, check what's installed, read logs, test commands, or create seed data. Automatically wraps the command with 'docker exec' (running container) or 'docker run --rm' (image). Commands are killed after 120 seconds.",
    parameters: {
      type: "object",
      properties: {
        container: {
          type: "string",
          description: 'Container name/ID (for running containers) or image name (to start a temporary container). e.g. "bright-app-local", "myapp-web-1", "abc123def"'
        },
        command: {
          type: "string",
          description: `Command to run inside the container (e.g. "which pnpm", "rails runner 'User.create!(...)'", "cat /app/config/database.yml", "ps aux")`
        }
      },
      required: ["container", "command"],
      additionalProperties: false
    }
  }
};
var waitTool = {
  type: "function",
  function: {
    name: "wait",
    description: "Wait for a specified number of seconds. Use this when services need time to start up before checking again. Max 60 seconds.",
    parameters: {
      type: "object",
      properties: {
        seconds: {
          type: "number",
          description: "Number of seconds to wait (1-60)"
        }
      },
      required: ["seconds"],
      additionalProperties: false
    }
  }
};
var searchWebTool2 = {
  type: "function",
  function: {
    name: "search_web",
    description: "Search the public web for technical solutions.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
      additionalProperties: false
    }
  }
};
var fetchUrlTool2 = {
  type: "function",
  function: {
    name: "fetch_url",
    description: "Fetch a web page and return its text content.",
    parameters: {
      type: "object",
      properties: { url: { type: "string", description: "URL to fetch" } },
      required: ["url"],
      additionalProperties: false
    }
  }
};
var infraTools = [
  ...codebaseTools,
  verifyDockerImageTool,
  writeFileTool,
  editFileTool,
  runCommandOnHostTool,
  runCommandInDockerTool,
  waitTool,
  probeUrlTool,
  searchWebTool2,
  fetchUrlTool2,
  saveHintTool,
  removeHintTool,
  getHintsTool
];
function execInDocker(repoPath, container, command, timeout = 12e4) {
  const isRunning = (() => {
    try {
      const out = execSync2(
        `docker inspect --format='{{.State.Running}}' ${JSON.stringify(container)} 2>/dev/null`,
        { encoding: "utf-8", timeout: 5e3 }
      ).trim();
      return out === "true";
    } catch {
      return false;
    }
  })();
  const prefix = isRunning ? `docker exec -i ${JSON.stringify(container)}` : `docker run --rm -i ${JSON.stringify(container)}`;
  const dockerCmd = `${prefix} sh <<'__BRIGHT_EOF__'
${command}
__BRIGHT_EOF__`;
  return runShellCommand(repoPath, dockerCmd, timeout);
}
function handleEditFile(repoPath, args) {
  const filePath = resolve3(repoPath, String(args.path ?? ""));
  if (!filePath.startsWith(repoPath)) {
    return "Error: path traversal attempt blocked";
  }
  const oldStr = String(args.old_string ?? "");
  const newStr = String(args.new_string ?? "");
  if (!oldStr) return "Error: old_string is required";
  try {
    const existing = readFileSync3(filePath, "utf-8");
    const count = existing.split(oldStr).length - 1;
    if (count === 0) {
      return `Error: old_string not found in ${args.path}. Make sure the string matches exactly (including whitespace and indentation).`;
    }
    if (count > 1) {
      return `Error: old_string found ${count} times in ${args.path}. Include more surrounding context to make it unique.`;
    }
    const updated = existing.replace(oldStr, newStr);
    writeFileSync3(filePath, updated);
    return `Edited ${args.path}: replaced ${oldStr.length} chars with ${newStr.length} chars`;
  } catch (err) {
    return `Error editing file: ${toErrorMessage(err)}`;
  }
}
function createInfraToolHandler(repoPath, hintOpts) {
  const baseHandler = createDockerfileToolHandler(repoPath);
  return async (name, args) => {
    switch (name) {
      case "write_file": {
        const filePath = resolve3(repoPath, String(args.path ?? ""));
        if (!filePath.startsWith(repoPath)) {
          return "Error: path traversal attempt blocked";
        }
        const content = String(args.content ?? "");
        try {
          writeFileSync3(filePath, content);
          return `Written ${content.length} bytes to ${args.path}`;
        } catch (err) {
          return `Error writing file: ${toErrorMessage(err)}`;
        }
      }
      case "edit_file":
        return handleEditFile(repoPath, args);
      case "run_command_on_host": {
        const command = String(args.command ?? "");
        if (/docker\s+compose\s+down\s+[^|]*-v/i.test(command) || /docker-compose\s+down\s+[^|]*-v/i.test(command) || /docker\s+volume\s+prune/i.test(command) || /docker\s+system\s+prune/i.test(command)) {
          console.warn(`[Tool] BLOCKED destructive command in infra repair: ${command.slice(0, 120)}`);
          return `Error: "docker compose down -v" and volume prune commands are blocked. They destroy ALL volumes including healthy data. Instead, remove only the specific stale volume: "docker compose down && docker volume rm <volume_name> && docker compose up -d". Use "docker volume ls" to identify which volume to remove.`;
        }
        console.log(`[Tool] run_command_on_host: ${command.slice(0, 200)}`);
        return runShellCommand(repoPath, command, 12e4);
      }
      case "run_command_in_docker": {
        const container = String(args.container ?? "");
        const cmd = String(args.command ?? "");
        console.log(`[Tool] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
        return execInDocker(repoPath, container, cmd, 12e4);
      }
      case "wait": {
        const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? 10)));
        console.log(`[Tool] wait: ${seconds}s`);
        await new Promise((r) => setTimeout(r, seconds * 1e3));
        return `Waited ${seconds} seconds`;
      }
      case "save_hint":
      case "remove_hint":
      case "get_hints": {
        const out = handleHintTool(name, args, hintOpts ?? {});
        if (out !== null) return out;
        break;
      }
      case "probe_url": {
        return probeUrl(args);
      }
      case "search_web":
      case "fetch_url": {
        const webHandler = createWebSearchHandler(repoPath);
        return webHandler(name, args);
      }
      default:
        return baseHandler(name, args);
    }
    return baseHandler(name, args);
  };
}

// src/bright-api.ts
async function brightGet(api, path2, query) {
  const url = new URL(path2, `https://${api.brightHostname}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== void 0 && v !== "") url.searchParams.set(k, String(v));
    }
  }
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        Accept: "application/json"
      }
    });
  } catch (err) {
    throw new Error(`Bright API request failed (${path2}): ${toErrorMessage(err)}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Bright API ${path2} returned HTTP ${res.status}: ${body.slice(0, 500)}`
    );
  }
  return await res.json();
}
function unwrapList(result) {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "items" in result) {
    return result.items;
  }
  return [];
}
async function listTests(api) {
  const data = await brightGet(api, "/api/v1/scans/tests");
  return unwrapList(data);
}
async function listAuthObjects(api, opts = {}) {
  const data = await brightGet(api, "/api/v3/auth-objects", {
    projectId: opts.projectId,
    q: opts.q,
    limit: opts.limit
  });
  return unwrapList(data);
}
async function getAuthObject(api, authObjectId) {
  return brightGet(
    api,
    `/api/v3/auth-objects/${encodeURIComponent(authObjectId)}`
  );
}
async function verifyBrightAuth(api) {
  const url = new URL("/api/v2/projects", `https://${api.brightHostname}`);
  url.searchParams.set("limit", "1");
  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        Accept: "application/json"
      }
    });
  } catch (err) {
    throw new Error(
      `Cannot reach Bright API at https://${api.brightHostname} \u2014 ${toErrorMessage(err)}. Check BRIGHT_HOSTNAME and network connectivity.`
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `BRIGHT_TOKEN was rejected by https://${api.brightHostname} (HTTP ${res.status}). Verify the token is valid, not expired, and has access to the target organization.`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Bright preflight failed: HTTP ${res.status} from /api/v2/projects: ${body.slice(0, 300)}`
    );
  }
}

// src/prompts/auth.ts
function detectAuthPrompt(stackStr, baseUrl, contextSummary) {
  const contextBlock = contextSummary ? `

Application context from previous phases:
${contextSummary}
` : "";
  const serviceMatch = stackStr.match(/\(service:\s*([^)]+)\)/);
  const monorepoBlock = serviceMatch ? `

## \u26A0\uFE0F MONOREPO: Target service is "${serviceMatch[1]}"
This is a monorepo. The RUNNING application on ${baseUrl} is the service at "${serviceMatch[1]}".
- ONLY analyze auth mechanisms from "${serviceMatch[1]}" source code \u2014 NOT from sibling apps (e.g. apps/web, apps/admin, packages/ui).
- Other apps in this repo may have completely different auth (e.g. NextAuth sessions vs OAuth2 tokens). Ignore them.
- Search files WITHIN "${serviceMatch[1]}" first. If auth middleware/guards are in shared packages, follow the imports FROM the target service.
- When probing ${baseUrl}, remember this is the "${serviceMatch[1]}" service \u2014 endpoints from other apps won't exist here.
` : "";
  return [
    {
      role: "system",
      content: `You are a security analyst examining a ${stackStr} application. Your task is to determine how the app authenticates users and extract the exact details needed to configure a DAST scanner.${contextBlock}${monorepoBlock}

You have codebase tools (read_file, list_files, search_files) AND a **probe_url** tool to make HTTP requests to the RUNNING application.

## Investigation steps:

1. **Search the codebase for auth mechanisms first** \u2014 look for:
   - Authentication middleware, before_action filters, guards, decorators (@login_required, @auth, passport.authenticate, etc.)
   - Login/session controllers, auth routes, token generation
   - User models, password hashing, CSRF token generation
   - Session configuration, cookie settings, JWT secret config
   - **OAuth2/OIDC controllers**: OAuthClient models, token endpoints, client_credentials grant, @nestjs/passport OAuth strategies, passport-oauth2, oauth2-server, authlib, django-oauth-toolkit
   If the codebase has ANY of these \u2192 auth IS required. Proceed to find the login endpoint details.
   
   **OAuth2 detection**: If you find OAuth controllers, /oauth/token routes, OAuthClient/PlatformOAuthClient models, client_credentials or password grant handlers, or environment vars like OAUTH_*, JWT_SECRET with no session login \u2192 set authType to "oauth". Probe common OAuth paths: /oauth/token, /v2/oauth/token, /auth/oauth2/token, /.well-known/openid-configuration.

2. **Probe the live app to confirm and gather details** \u2014 use probe_url:
   - GET ${baseUrl}/ \u2014 check the response. NOTE: Many apps (forums, wikis, CMS, blogs) serve PUBLIC pages without auth. A 200 response on the homepage does NOT mean auth is unnecessary.
   - Search the codebase for actual protected routes (admin panels, user settings, API endpoints with auth middleware) and probe THOSE specific paths.
   - Check for login/session endpoints found in the codebase (not generic guesses).

3. **Find the login endpoint** \u2014 search for auth controllers, login routes, sign-in handlers. IMPORTANT: distinguish between the HTML login PAGE (e.g. /login) and the API endpoint that PROCESSES credentials (e.g. POST /session, POST /api/auth/login). Read the handler code to determine:
   - The exact API endpoint that processes login (NOT the page that renders the login form)
   - The exact request body field names (e.g. "user", "email", "username", "password"). NOTE: the login form may label the field "Email" in the UI but the API field is actually called "username" (and vice versa). Always check the actual HTML input 'name' attribute or the controller's expected parameter names, not just the UI label.
   - How the token/session is returned: response body field, response header, or Set-Cookie
   - Whether it's session-based (cookies), JWT (token in body/header), or API key
   For loginEndpoint, always use the API endpoint path. If unsure, probe POST to candidate endpoints to find the one that accepts credentials.

4. **CSRF / pre-auth token analysis** \u2014 CRITICAL: Check whether the login form requires a CSRF token or similar pre-auth value:
   - Probe the login page (GET the URL where the login form is rendered). If GET /login returns 405, try GET / \u2014 many apps redirect unauthenticated users to a login page at the root URL.
   - Look for hidden form fields: \`<input type="hidden" name="csrf" value="...">\`, \`<input name="csrfmiddlewaretoken">\`, \`<input name="_token">\`, \`<input name="authenticity_token">\`, etc.
   - Check the codebase for CSRF middleware or validation logic in the login handler.
   - If a CSRF or hidden token field IS required in the login POST body, report: csrfRequired=true, the field name, the URL to GET the form from, and how the token is delivered (form_body vs header vs json_body).
   - If CSRF is in a JSON endpoint (e.g. GET /session/csrf returns {"csrf":"..."}) AND is sent as an HTTP header (X-CSRF-Token), that's csrfDelivery="header".
   - If CSRF is in a JSON endpoint BUT must be included in the POST body as a field (e.g. NextAuth: GET /api/auth/csrf \u2192 {"csrfToken":"..."} and login POST body must include csrfToken=...), that's csrfDelivery="json_body" \u2014 this requires create_auth_raw with NexTemplate to extract from JSON and inject into the body.
   - If CSRF is embedded in HTML (hidden form input) and must be sent in the POST body, that's csrfDelivery="form_body" \u2014 this requires the raw auth tool with NexTemplate extraction.

5. **Find real credentials** \u2014 search docker-compose files, .env files, seed/fixture files, README for default users/passwords. NEVER invent credentials \u2014 only use values found in the actual codebase. If none found, set loginBody to null.

6. **Find the registration endpoint** (if applicable) \u2014 if no seeded users exist, find a signup/register route and build a registerBody with consistent test credentials.

7. **Identify a protected endpoint** \u2014 find a route with auth middleware applied (e.g. before_action, @login_required, passport.authenticate) that returns 401/403/302 when unauthenticated. Use probe_url to VERIFY it actually requires auth.

CRITICAL RULES:
- If the codebase has authentication mechanisms (login controllers, session management, auth middleware, password hashing, CSRF tokens), then requiresAuth IS true \u2014 regardless of what HTTP probes return.
- Many apps (forums, wikis, CMS, e-commerce) have public pages that return 200 without auth. This does NOT mean auth is unnecessary. These apps still need auth for admin, posting, user profiles, and API operations.
- If probe responses return HTML when you requested JSON (Accept: application/json), the app may be serving a catch-all page (setup wizard, SPA shell). This does NOT mean the endpoint is unprotected.
- If EVERY endpoint returns 200 with similar HTML content, the app is likely in a special state (setup wizard, SPA with client-side routing). Auth IS almost certainly still required.
- Default to requiresAuth: true. Only set requiresAuth: false if you are CERTAIN the app has no auth at all (no login endpoint, no session management, no user model, no auth middleware anywhere in the codebase).
- If no session login/form-based auth is found BUT the codebase has OAuth controllers, token endpoints, JWT_SECRET, or API key guards \u2192 set authType to "oauth" or "api_key" (NOT "none"). An API without session login almost always uses token-based auth.

Base URL: ${baseUrl}`
    },
    {
      role: "user",
      content: `Analyze the authentication for this app.

Search the codebase and read files before answering.

Return a JSON object:
{
  "requiresAuth": true/false,
  "authType": "jwt" | "session" | "api_key" | "basic" | "oauth" | "none",
  "loginEndpoint": "/api/auth/login" or null,
  "loginMethod": "POST" or null,
  "loginBody": "{\\"user\\":\\"actual-user\\",\\"password\\":\\"actual-pass\\"}" or null,
  "loginContentType": "json" | "form" | "xml",
  "tokenLocation": "body" | "header" | "cookie",
  "tokenFieldPath": "token" or "authorization" or null,
  "tokenEmbedLocation": "header" | "cookie" | "query",
  "headerName": "Authorization" or null,
  "headerPrefix": "Bearer " or "" or null,
  "cookieName": "session" or null,
  "queryParamName": "token" or null,
  "reauthIndicator": "status" | "redirect" | "body",
  "reauthBodyPattern": "regex pattern" or null,
  "protectedEndpointPath": "/api/protected" or null,
  "registerEndpoint": "/register" or null,
  "registerMethod": "POST" or null,
  "registerBody": "email=test@test.com&password=pass" or null,
  "csrfRequired": true/false,
  "csrfFieldName": "csrf" or "csrfmiddlewaretoken" or "_token" or null,
  "csrfFormUrl": "/" or "/login" or null,
  "csrfDelivery": "form_body" | "header" | "json_body" | null,
  "csrfExtractPattern": "name=\\"csrf\\"\\s+value=\\"([^\\"]+)\\"" or null,
  "oauthTokenEndpoint": "/oauth/token" or "/v2/auth/oauth2/token" or null,
  "oauthClientId": "found-client-id" or null,
  "oauthClientSecret": "found-client-secret" or null,
  "oauthScope": "read write" or null,
  "oauthGrantType": "client_credentials" or "password" or null,
  "notes": "brief description"
}

Key rules:
- loginBody values MUST come from seed data, env vars, or code you actually read
- If no credentials found but registration exists, invent consistent test credentials for both registerBody and loginBody
- loginBody format must match loginContentType: URL-encoded for "form", JSON for "json"
- tokenLocation: read the login handler to determine if token is in response body, header, or cookie
- protectedEndpointPath: find a route with auth middleware in the codebase and confirm it requires authentication
- csrfRequired: set to true if the login POST requires a CSRF token or hidden form field. Probe the login page to verify.
- csrfFieldName: the exact form field name (e.g. "csrf", "csrfmiddlewaretoken", "_token", "authenticity_token")
- csrfFormUrl: the URL to GET that serves the login form HTML containing the CSRF token (may be "/" if the app redirects there)
- csrfDelivery: "form_body" if the token must be in the POST body (HTML hidden input), "header" if it goes in an X-CSRF-Token header (JSON API), "json_body" if it comes from a JSON endpoint but must be included in the POST body as a field (e.g. NextAuth csrfToken)
- For authType "oauth": fill in oauthTokenEndpoint, oauthClientId/Secret (if found in env/seed files), oauthScope, oauthGrantType. Use "client_credentials" when the API is machine-to-machine (no user login). Use "password" when the API exchanges user credentials (username+password) via a token endpoint for a Bearer token (ROPC flow \u2014 common in Django REST, Laravel Passport, Spring Boot OAuth). The loginEndpoint/loginBody fields are less relevant for "client_credentials" but still useful for "password" grant (loginBody should contain the username/password).
- **IMPORTANT \u2014 authorization_code vs api_key**: If the OAuth token endpoint ONLY supports "authorization_code" (interactive browser redirect) and NOT "client_credentials" or "password", the OAuth flow is NOT automatable. In this case, check if the API ALSO accepts static headers (API key, client ID + secret headers like x-cal-client-id). If so, set authType to "api_key" (not "oauth") with the correct headerName. Probe: if the app accepts requests with custom auth headers (like x-api-key, x-client-id, or similar) WITHOUT a token endpoint exchange, that's api_key auth.
- For authType "api_key": set headerName to the auth header name (e.g. "x-cal-client-id", "X-API-Key", "Authorization"). If the API uses multiple headers for auth (e.g. x-cal-client-id + x-cal-secret-key), set headerName to the primary one and describe ALL required headers in "notes". No oauthTokenEndpoint is needed.
- csrfExtractPattern: regex to extract the CSRF token from the HTML response body (capture group 1 = token value)`
    }
  ];
}
function configureAuthPrompt(baseUrl, testUrl, detection, userConfirmed, preProbeContext, authHints = []) {
  const authStyle = detection.authType === "session" ? "session" : detection.authType === "jwt" ? "jwt" : detection.authType === "api_key" ? "api_key" : detection.authType === "oauth" ? "oidc" : "session";
  const isApiAuth = authStyle === "oidc" || authStyle === "api_key";
  const credentialNote = isApiAuth ? `
This is an API service (no login form). You have three tools: create_auth_oidc (OAuth token exchange), create_auth_header (static headers), and create_auth_raw (multi-step custom). Try them in that order. Check auth hints for seeded credentials.` : userConfirmed ? `
A test user has been created and confirmed. Credentials: ${detection.loginBody ?? "unknown"}. Proceed with probing and auth object creation.` : `
No confirmed user exists. Credentials from codebase: ${detection.loginBody ?? "unknown"}. These may not work \u2014 if auth tests fail, diagnose with command tools and try different credentials or respond INFRA_REPAIR if the issue is infrastructure.`;
  let csrfGuidance = "";
  if (detection.csrfRequired && detection.csrfDelivery === "form_body") {
    const fieldName = detection.csrfFieldName ?? "csrf";
    const formUrl = detection.csrfFormUrl ? `${baseUrl}${detection.csrfFormUrl}` : `${baseUrl}/`;
    const extractPattern = detection.csrfExtractPattern ?? `name="${fieldName}"\\s+value="([^"]+)"`;
    csrfGuidance = `

## \u26A0\uFE0F MANDATORY: This app uses HTML form-body CSRF
The detection phase confirmed this app embeds a CSRF token as a hidden form field ("${fieldName}") in the login page HTML.
You **MUST** use \`create_auth_raw\` (NOT create_auth) to handle this. The CSRF token must be extracted from the HTML and included in the POST body.

**Exact steps to use:**
1. Step "get_csrf": GET ${formUrl} \u2192 extracts the CSRF token from the HTML response body
2. Step "login": POST ${baseUrl}${detection.loginEndpoint ?? "/login"} with body containing:
   \`${fieldName}={{ auth_object.stages.get_csrf.response.body | match:/${extractPattern}/ }}&username=...&password=...\`

**Do NOT use create_auth** \u2014 it only supports CSRF as an HTTP header, but this app requires it in the POST body.
**Do NOT skip the CSRF field** \u2014 login will appear to succeed (302) but the session won't actually be authenticated.`;
  } else if (detection.csrfRequired && detection.csrfDelivery === "json_body") {
    const fieldName = detection.csrfFieldName ?? "csrfToken";
    const csrfUrl = detection.csrfFormUrl ? `${baseUrl}${detection.csrfFormUrl}` : `${baseUrl}/api/auth/csrf`;
    const extractPattern = detection.csrfExtractPattern ?? `"${fieldName}"\\s*:\\s*"([^"]+)"`;
    csrfGuidance = `

## \u26A0\uFE0F MANDATORY: This app uses JSON-body CSRF (e.g. NextAuth)
The CSRF token is served from a JSON endpoint (${csrfUrl}) and must be included in the login POST **body** (NOT as a header).
You **MUST** use \`create_auth_raw\` (NOT create_auth) to handle this.

**Exact steps to use:**
1. Step "get_csrf": GET ${csrfUrl} \u2192 returns JSON with "${fieldName}" field
2. Step "login": POST ${baseUrl}${detection.loginEndpoint ?? "/api/auth/callback/credentials"} with body containing:
   \`${fieldName}={{ auth_object.stages.get_csrf.response.body | match:/${extractPattern}/ }}&email=...&password=...&redirect=false&json=true\`

**Do NOT use create_auth** \u2014 it injects CSRF as a header, but this app requires it in the POST body field.
**Test URL**: Use an API endpoint like /api/auth/session that returns different JSON for authed vs unauthed (e.g. {} vs {user:...}).
**Reauth triggers**: Use body pattern trigger for empty JSON: [{ type: "TRIGGER", location: "body", patterns: ["^\\\\{\\\\}$"] }]`;
  } else if (detection.csrfRequired && detection.csrfDelivery === "header") {
    csrfGuidance = `

## CSRF Note
This app uses header-based CSRF (e.g. X-CSRF-Token from a JSON endpoint). You can use \`create_auth\` with a csrfUrl parameter, or \`create_auth_raw\` with a pre-step that fetches the token.`;
  }
  let apiAuthGuidance = "";
  if (detection.authType === "oauth" || detection.authType === "api_key") {
    const tokenEndpoint = detection.oauthTokenEndpoint ? `${baseUrl}${detection.oauthTokenEndpoint}` : null;
    const clientId = detection.oauthClientId ?? null;
    const clientSecret = detection.oauthClientSecret ?? null;
    const scope = detection.oauthScope ?? "";
    const grantType = detection.oauthGrantType ?? "client_credentials";
    const credsBlock = clientId && clientSecret ? `**Available credentials (seeded or found):**
- clientId: "${clientId}"
- clientSecret: "${clientSecret}"
${tokenEndpoint ? `- tokenEndpoint: "${tokenEndpoint}"` : "- tokenEndpoint: unknown (probe to find)"}
Use these for EITHER OIDC token exchange OR as static header values.` : `**No pre-seeded credentials found.** Use run_command_in_docker/run_command_on_host to:
1. Search the database for existing clients/keys: OAuthClient, ApiKey, api_keys, oauth_clients tables
2. Create one via direct SQL INSERT or app CLI`;
    apiAuthGuidance = `

## \u26A0\uFE0F This is an API service \u2014 no login form, no user session
This API authenticates requests via tokens or static headers. You have THREE tools available \u2014 try them in order:

${credsBlock}

### Option 1: \`create_auth_oidc\` (OAuth2 token exchange)
Best when the token endpoint accepts client_credentials or password grant.
${tokenEndpoint ? `- tokenEndpoint: "${tokenEndpoint}" (probe POST with grant_type=${grantType})` : "- Probe common paths: /oauth/token, /v2/auth/oauth2/token, /.well-known/openid-configuration"}
- clientId: "${clientId ?? "FIND_OR_CREATE"}"
- clientSecret: "${clientSecret ?? "FIND_OR_CREATE"}"
${grantType === "password" ? '- grantType: "password" + username/password from seeded user or auth hints' : `- grantType: "${grantType}"`}
${scope ? `- scope: "${scope}"` : ""}
- testUrl: protected endpoint returning 401 (e.g. /v2/me, /api/me)

### Option 2: \`create_auth_header\` (static headers)
Best when the API accepts fixed headers on every request \u2014 no token exchange needed.
- headers: JSON array, e.g. [{"name":"x-cal-client-id","value":"${clientId ?? "ID"}"},{"name":"x-cal-secret-key","value":"${clientSecret ?? "SECRET"}"}]
- testUrl: endpoint returning 401 without headers, 200 with them
- Common patterns: x-cal-client-id + x-cal-secret-key, Authorization: Bearer <key>, X-API-Key: <key>

### Option 3: \`create_auth_raw\` (multi-step custom flow)
Use when neither OIDC nor static headers work directly \u2014 e.g. you need to hit a custom token endpoint, extract a value, and embed it.

### Strategy:
1. **Probe first**: GET a protected endpoint (e.g. /v2/me) without auth \u2192 expect 401
2. **Try OIDC**: If a token endpoint exists, try create_auth_oidc. If it rejects the grant type \u2192 move on.
3. **Try static headers**: Probe WITH auth headers (using probe_url headers parameter) to see if the API accepts them directly. Try:
   - x-cal-client-id: ${clientId ?? "ID"} + x-cal-secret-key: ${clientSecret ?? "SECRET"}
   - Authorization: Bearer ${clientId ?? "KEY"}
   - Search the codebase for header names the auth guard checks (e.g. "x-api-key", custom headers)
4. **If static headers work** \u2192 create_auth_header with those headers
5. **If neither works** \u2192 try create_auth_raw with a custom token exchange flow

**NEVER respond with INFRA_REPAIR** for auth mechanism issues (wrong grant type, rejected headers, etc). That's an auth problem, not infra.
**Do NOT respond FAILED** until you've tried ALL three options above.`;
  }
  const hintsStore = authHints.length > 0 ? HintStore.fromLegacyArray(authHints) : null;
  const hintsBody = hintsStore?.format(void 0, "## Saved hints");
  const hintsBlock = hintsBody ? `
${hintsBody}

These facts were learned during scan preparation, auth detection, verified probes, or previous auth attempts. Trust them over guesses and do not rediscover or contradict them unless you have concrete evidence.
` : "";
  return [
    {
      role: "system",
      content: `You are an expert at configuring Bright DAST authentication objects. Your job is to create a working auth object and verify it passes all tests. You have many rounds available \u2014 use ALL of them. Do NOT give up early.

## Context
- Base URL: ${baseUrl}
- Auth type: ${detection.authType} (use authStyle="${authStyle}")
- Login: ${detection.loginMethod ?? "POST"} ${detection.loginEndpoint ?? "unknown"}
- Login body: ${detection.loginBody ?? "unknown"}
- Content type: ${detection.loginContentType}
- Token: ${detection.tokenLocation} \u2192 embed via ${detection.tokenEmbedLocation}
- Token field: ${detection.tokenFieldPath ?? "unknown"}
- Auth header: ${detection.headerName ?? "Authorization"}${detection.headerPrefix ? ` with prefix ${JSON.stringify(detection.headerPrefix)}` : ""}
- Cookie: ${detection.cookieName ?? "none"}
- Reauth: ${detection.reauthIndicator}
- Suggested test URL: ${testUrl}
${credentialNote}
${csrfGuidance}
${apiAuthGuidance}

## Available tools
- **probe_url** \u2014 Make HTTP requests to the running app. Use for DISCOVERY: finding real endpoints, checking response formats, understanding what the app returns. Cookies are tracked automatically across calls.
- **run_command_on_host** \u2014 \u26A0\uFE0F DIAGNOSTIC ONLY. Run read-only shell commands on the host (docker ps, docker logs, docker inspect, printenv). Do NOT restart, kill, or modify anything.
- **run_command_in_docker** \u2014 \u26A0\uFE0F DIAGNOSTIC ONLY. Run read-only commands inside a Docker container (check user state, inspect environment, query database). Do NOT restart processes, kill PIDs, or modify config files.
- **read_file / search_files / list_files** \u2014 Inspect the codebase to understand auth flow.
- **search_web** \u2014 Search the internet for how the public OSS app/framework handles authentication, API endpoints, CSRF tokens, etc. Use when probe_url returns unexpected results and codebase inspection isn't enough. Never search local repo paths or internal monorepo service names; inspect the codebase for those.
- **fetch_url** \u2014 Fetch full content of a web page (e.g. app documentation, Stack Overflow answer). Large pages are saved to .bright-fetched-page.txt \u2014 use read_file to see full content.
- **create_auth** \u2014 Create a Bright auth object with simplified parameters. Best for standard session/cookie, JWT, and API key flows where CSRF is in a **JSON endpoint** or a **Rails meta tag**. Do NOT use for Django/Laravel-style CSRF hidden form fields.
- **create_auth_raw** \u2014 Create a Bright auth object with FULL multistep control. Use this for:
  - **CSRF tokens embedded in HTML form fields** (Django csrfmiddlewaretoken, Laravel _token, etc.) \u2014 you MUST use this because create_auth only injects CSRF as a header, but these frameworks expect it in the POST body
  - OAuth2 PKCE, authorization code grants, or any multi-step token exchange
  - Any flow where you need to extract values between steps using NexTemplate
- **create_auth_oidc** \u2014 Create a Bright OIDC/OAuth2 auth object using client_credentials grant. Use this for API services that authenticate via Bearer tokens obtained from a token endpoint. Bright handles token exchange and automatic refresh. You need: tokenEndpoint, clientId, clientSecret, and a testUrl that returns 401 without a valid token.
- **create_auth_header** \u2014 Create a Bright "header" auth object with static headers attached to every request. Use for API key auth, custom headers (x-api-key, x-cal-client-id + x-cal-secret-key), or any pre-generated token. No login/exchange flow. Pass headers as JSON array: [{"name":"X-Key","value":"val"}]. Supports multiple headers.
- **test_auth_object** \u2014 Test if the auth object works end-to-end. Returns stage-by-stage results. Use this as your source of truth.
- **delete_auth_object** \u2014 Delete a broken auth object to recreate with different settings.
- **save_hint** \u2014 Save a concise auth fact for later attempts. Use this whenever you learn something non-obvious from code/probes/test feedback, such as exact token location, required header prefix, required login body fields, verified test URL behavior, or a failed config pattern to avoid.
- **remove_hint** \u2014 Remove a saved auth hint that is wrong or misleading.
${hintsBlock}

## When to use create_auth vs create_auth_raw
- **create_auth**: Standard flows \u2014 single login POST that returns a cookie or JWT. CSRF must come from a **JSON endpoint** (e.g. GET /csrf returns {"csrf":"token"}). Works for: Rails (API mode), Express, most SPA backends, Grafana, Gitea, etc.
- **JWT in response header**: If login returns the token in a response header (commonly \`Authorization: Bearer <jwt>\`), use \`create_auth\` with \`authStyle="jwt"\`, \`tokenLocation="header"\`, \`tokenFieldPath="Authorization"\`, \`headerName="Authorization"\`, and \`headerPrefix="Bearer "\`. Do NOT try body regexes like \`"access_token"\` when the token is not in the body.
- **create_auth_raw**: Use when you need full control over steps and request bodies. **REQUIRED for:**
  1. **HTML form CSRF** (Django, Laravel, classic server-rendered apps) \u2014 the CSRF token is a hidden input field in the HTML form. You extract it from the GET response body and inject it into the POST body (not a header).
  2. **OAuth2 PKCE / authorization code** \u2014 multi-step flows with token exchange.
  3. **Any flow where create_auth fails** \u2014 when you need to customize exactly what gets sent.

  With create_auth_raw, you define each step and use NexTemplate expressions to pass values between steps:
  - Body extraction: {{ auth_object.stages.<step_name>.response.body | match:/<regex_with_capture_group>/ }}
  - Header extraction MUST use Bright's documented \`get\` pipe, not dot notation: {{ auth_object.stages.<step_name>.response.headers | get: '/Header-Name' | match:/<regex>/ }}
  - Example Authorization response header extraction: {{ auth_object.stages.login.response.headers | get: '/Authorization' | match:/(?:Bearers+)?([^s,;]+)/ }}
  - Do NOT use invalid header dot/bracket syntax such as \`response.headers.Authorization\`, \`response.headers.authorization\`, or \`response.headers["Authorization"]\`.
  Use followRedirects: false on steps where you need to capture the Location header (e.g. OAuth2 authorize \u2192 302).

### Example: Django CSRF (csrfmiddlewaretoken in HTML form)
Django renders a hidden input \`<input type="hidden" name="csrfmiddlewaretoken" value="TOKEN...">\` in the login page.
You MUST use create_auth_raw to embed it in the POST body:
\`\`\`
steps: [
  { name: "get_csrf", request: { method: "GET", url: "http://localhost:8080/login", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
  { name: "login", request: { method: "POST", url: "http://localhost:8080/login", protocol: "http",
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body: "csrfmiddlewaretoken={{ auth_object.stages.get_csrf.response.body | match:/csrfmiddlewaretoken"\\s+value="([^"]+)"/ }}&username=bright_test&password=BrightTest123%21",
    followRedirects: false, maxRedirects: 0 },
    successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
]
reauthTriggers: [{ type: "TRIGGER", location: "status", statuses: [401, 403] }, { type: "OR" }, { type: "TRIGGER", location: "header", name: "Location", patterns: ["login"] }]
\`\`\`
Key: the CSRF token goes IN the body with NexTemplate, NOT as a header. URL-encode special characters in the password (! \u2192 %21).

### Example: Laravel CSRF (_token in HTML form)
Same pattern \u2014 extract _token from the HTML form and inject into POST body:
\`\`\`
steps: [
  { name: "get_csrf", request: { method: "GET", url: "http://localhost:8000/login", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
  { name: "login", request: { method: "POST", url: "http://localhost:8000/login", protocol: "http",
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body: "_token={{ auth_object.stages.get_csrf.response.body | match:/name="_token"\\s+value="([^"]+)"/ }}&email=bright@test.com&password=BrightTest123%21",
    followRedirects: false, maxRedirects: 0 },
    successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
]
\`\`\`

### Example: NextAuth (CSRF from JSON endpoint, token in POST body)
NextAuth exposes GET /api/auth/csrf which returns {"csrfToken":"..."}. The CSRF token must be included in the login POST body (NOT as a header). Login also needs redirect=false and json=true in the body to get a JSON response instead of a redirect.
\`\`\`
steps: [
  { name: "get_csrf", request: { method: "GET", url: "http://localhost:3000/api/auth/csrf", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
  { name: "login", request: { method: "POST", url: "http://localhost:3000/api/auth/callback/credentials", protocol: "http",
    headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }],
    body: "csrfToken={{ auth_object.stages.get_csrf.response.body | match:/"csrfToken"\\s*:\\s*"([^"]+)"/ }}&email=bright%40test.com&password=BrightTest123%21&redirect=false&json=true&callbackUrl=http%3A%2F%2Flocalhost%3A3000",
    followRedirects: false, maxRedirects: 0 },
    successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
]
testUrl: GET /api/auth/session (returns {} when unauthed, {user:...} when authed)
reauthTriggers: [{ type: "TRIGGER", location: "body", patterns: ["^\\\\{\\\\}$"] }]
successResponseDetection: [{ type: "status", statuses: [200] }]
\`\`\`
Key: NextAuth CSRF goes in the POST body as csrfToken=..., NOT as a header. The testUrl /api/auth/session returns empty JSON {} when not logged in \u2014 use a body reauthTrigger for "^\\{\\}$".

### Example: OAuth2 / OIDC API (client_credentials)
For API-only services that use OAuth2 with client credentials (e.g. NestJS platform APIs, microservices):
\`\`\`
Use create_auth_oidc tool:
  tokenEndpoint: "http://localhost:5555/oauth/token"
  clientId: "my-client-id"
  clientSecret: "my-client-secret"
  testUrl: "http://localhost:5555/v2/me" (should return 401 without token)
  scope: "read write" (optional)
\`\`\`
Key: You need a valid OAuth2 client. Use run_command_in_docker or run_command_on_host to:
1. Check if the app has CLI commands to create OAuth2 clients (e.g. \`npx prisma db seed\`, management commands)
2. Query the database directly to find or create a client: \`docker exec <container> sh -c "node -e \\"...\\""\`
3. Use the app's admin API if available to register a client
4. Check seed files or migrations for pre-created OAuth2 clients

## Workflow

### Step 1: Discover the REAL login API endpoint
The detected loginEndpoint may be an HTML page (e.g. /login) rather than the API endpoint that processes credentials.
1. Check the pre-probe results \u2014 if loginEndpoint is marked as "HTML page", do NOT use it as loginUrl
2. Look for "Candidate API login" entries in the pre-probe \u2014 those are the real API endpoints
3. If unsure, probe POST to common API patterns with an empty JSON body \u2014 400/401/403/422 means it's a real endpoint (rejected creds), 404 means wrong:
   - POST ${baseUrl}/api/login
   - POST ${baseUrl}/api/auth/login
   - POST ${baseUrl}/auth/sign_in
   - POST ${baseUrl}/api/session
   - POST ${baseUrl}/login
   - POST ${baseUrl}/api/v1/auth/login
4. Also search the codebase: search for route definitions that handle POST login/auth/session

### Step 2: Discover test URL candidates using probe_url
1. Probe several .json endpoints WITHOUT auth to find ones that return different content when authenticated:
    - Endpoints returning 401/403 are ideal testUrls
    - If a detected protected route has placeholders, fill them with the actual registered user values (e.g. use /api/users/one/test%40test.com/photo for /api/users/one/:email/photo). Do NOT replace :email with "1".
    - Avoid endpoints that return the same 403 "Forbidden" before and after login; those usually require a different role/user and are bad auth-validation URLs.
    - Endpoints returning 200 with "login_required" or "not_logged_in" in the body need reauthStrategy='body'
    - Endpoints returning 200 with the same content regardless of auth are USELESS as testUrls \u2014 skip them
    - Endpoints returning 404 are USELESS \u2014 skip them
2. Note down exactly what the unauthenticated response looks like (status, body pattern) for each candidate

### Step 3: Create auth object and use test_auth_object to verify
1. Call create_auth with your best parameters \u2014 use the REAL API endpoint as loginUrl (NOT an HTML page)
2. Call test_auth_object \u2014 this is the source of truth. It returns FULL diagnostic data for each stage:
   - **request**: method, URL, body sent
   - **response**: HTTP status, body preview (first 800 chars), Set-Cookie headers, content-type
3. Read the test results carefully for EACH stage \u2014 especially the **response body preview**:

   **If "validation" fails** ("did not match any auth triggers"):
   \u2192 The testUrl returns the same response regardless of auth. The Bright platform cannot distinguish auth/unauth.
   \u2192 Fix: pick a DIFFERENT testUrl. Use probe_url to find one where authenticated vs unauthenticated responses differ.
   \u2192 If no endpoint returns 401/403, use reauthStrategy='body' with a reauthBodyPattern that matches the UNAUTHENTICATED body.

   **If "authentication" fails**:
   \u2192 The login request itself failed. Possible causes:
   - Wrong loginUrl (HTML page instead of API endpoint)
   - Wrong credentials
   - Missing CSRF token \u2014 add csrfUrl
   - Wrong loginBody format (json vs form mismatch)
   - **Login returned HTTP 500 with Content-Type text/html** \u2014 the server tried to render HTML but crashed (e.g. missing ImageMagick or other system dependency). TWO actions:
     1. QUICK FIX: recreate auth with loginAccept='application/json' to request JSON response instead of HTML
     2. ROOT CAUSE: use run_command_in_docker to check app logs for the actual error. If it's a missing dependency, respond with INFRA_REPAIR \u2014 broken HTML rendering means client-side security tests (XSS, CSS injection, etc.) won't work either.
   \u2192 Fix: probe the login endpoint to understand what it expects, then recreate.

   **If "authentication" succeeds but response body is HTML (not JSON)**:
   \u2192 The server returned 200 but with an HTML error/warning page instead of a real login response.
   \u2192 This means login was NOT actually processed. Common causes:
   - App running in dev mode and needs an environment variable (e.g. ALLOW_EMBER_CLI_PROXY_BYPASS=1)
   - Server is redirecting to a setup/install page
   - User account not activated/confirmed (check with run_command_in_docker)
   \u2192 Fix: Use run_command_on_host/run_command_in_docker to DIAGNOSE the root cause, then respond with INFRA_REPAIR if it requires a container restart or compose change.

    **If "authorization" fails** ("Status is in Set{401, 403}" or body pattern match):
    \u2192 Login appeared to succeed but the test request was still unauthenticated.
    \u2192 **CHECK THE LOGIN RESPONSE** \u2014 look at the authentication stage's response body and Set-Cookie headers:
      - If the login response body is HTML (not JSON), login did NOT actually work \u2014 fix the application first
      - If the login response has no new Set-Cookie headers, the session wasn't established
      - If this is JWT auth and the login response body has no token but the app sends an Authorization response header, recreate with \`tokenLocation="header"\` and \`tokenFieldPath="Authorization"\`
      - If the login response body contains error messages, credentials or format are wrong
      - If validation and authorization both return the same 403 "Forbidden" body, the testUrl is probably not accessible to this user. Change testUrl to a protected endpoint for the registered user instead of changing token extraction.
    \u2192 Fix: address the root cause found in the login response, try different testUrl, try reauthStrategy='body'.

4. Delete the failed auth object and try a DIFFERENT approach. Change one thing at a time:
   - Different loginUrl (API vs HTML)
   - Different testUrl
   - Different reauthStrategy (status \u2192 body \u2192 redirect)
   - Different loginBody format (json vs form)
   - **Different credential field names** \u2014 many apps accept EITHER "username" or "email" for the login identifier. If {"username":"bright@test.com","password":"..."} fails, try {"email":"bright@test.com","password":"..."} and vice versa. Also try {"login":"..."}, {"user":{"email":"...","password":"..."}} (nested). Check the login form HTML \u2014 the input field 'name' attribute tells you exactly what the server expects.
   - Add/remove csrfUrl
   - Add loginAccept='application/json' if login returns HTML error pages
   - Add cookieUrl (app root URL) if CSRF token fails despite being correct (session cookie needed before CSRF)
   - **Switch to create_auth_raw if CSRF is in an HTML form field** \u2014 if the login page has a hidden input like \`<input type="hidden" name="csrfmiddlewaretoken" value="...">\` (Django) or \`<input type="hidden" name="_token" value="...">\` (Laravel), you MUST use create_auth_raw because create_auth only injects CSRF as a header, but these frameworks require it in the POST body. See the Django/Laravel examples in the "When to use create_auth vs create_auth_raw" section above. This is NOT an infrastructure problem \u2014 do NOT respond with INFRA_REPAIR for CSRF issues.
   - **Switch to create_auth_raw for OAuth2/PKCE/multi-step flows** \u2014 if the app uses Bearer tokens obtained via authorization code exchange, build the full step chain: login POST \u2192 authorize GET (followRedirects:false) \u2192 token POST \u2192 Bearer embedder.
   - **If the application itself is misconfigured**, diagnose with command tools and respond with INFRA_REPAIR

## CRITICAL PERSISTENCE RULES
- **NEVER respond with "FAILED" until you have exhausted ALL of the following strategies:**
  1. At least 3 different loginUrl candidates (the detected one + API alternatives)
  2. At least 3 different testUrl candidates
  3. Both reauthStrategy='status' and reauthStrategy='body' with reauthBodyPattern
  4. Both json and form loginContentType
  5. With and without csrfUrl
  6. Different credential field names \u2014 try "username", "email", "login" as the identifier field; some apps use the email address in the "username" field, others have a separate "email" field
  7. **create_auth_raw is MANDATORY before giving up** \u2014 you MUST try create_auth_raw for: (a) HTML form CSRF (Django csrfmiddlewaretoken, Laravel _token, any hidden form field), (b) OAuth2/PKCE/multi-step token exchange, (c) any case where create_auth keeps failing. CSRF extraction issues are auth config problems \u2014 do NOT request INFRA_REPAIR for them.
  8. **If login responses contain HTML error pages or misconfiguration warnings**, diagnose with command tools and respond with INFRA_REPAIR \u2014 do NOT try to fix the app yourself (no killing processes, no restarting containers, no modifying files)
- **After each failed test_auth_object, analyze the response body previews for EACH stage to understand the root cause.**
- **Use probe_url between attempts to gather more data** \u2014 probe new endpoints, check response formats, search the codebase for auth routes.
- **You have 50 rounds. Use them ALL before giving up.** Each create/test/delete cycle takes ~3 rounds. You can try 15+ different configurations.

## Response format
- When all stages pass, respond with ONLY the auth object ID.
- If the problem is an **infrastructure issue that requires restarting the application** (e.g. missing environment variable in docker-compose, wrong Dockerfile config, app needs to be rebuilt with different settings), respond with:
  \`INFRA_REPAIR: <description of what needs to change>\`
  Examples:
  - \`INFRA_REPAIR: The app requires an environment variable (e.g. ALLOW_EMBER_CLI_PROXY_BYPASS=1) in compose.yml \u2014 without it, API requests return HTML instead of JSON\`
  - \`INFRA_REPAIR: The app's DATABASE_URL points to localhost but the DB is in a separate container \u2014 change it to postgres://db:5432 in compose.yml\`
  - \`INFRA_REPAIR: The Rails app needs RAILS_ENV=production in compose.yml \u2014 development mode requires Ember CLI which is not available\`
  Use INFRA_REPAIR when: you've identified the root cause, it requires changing compose.yml/Dockerfile/environment, and you CANNOT fix it from inside the running container (e.g. env vars set at startup, Docker build changes, service configuration). Do NOT use INFRA_REPAIR for auth config issues \u2014 only for app infrastructure problems.
- If you truly exhausted everything and the problem is NOT infrastructure, respond "FAILED".`
    },
    {
      role: "user",
      content: `Create and test a working auth object for this application. Return only the auth object ID when it passes.${preProbeContext ? `

## Pre-probe results (already fetched for you)
${preProbeContext}` : ""}`
    }
  ];
}
function seedUserPrompt(baseUrl, detection) {
  const loginInfo = detection.loginEndpoint ? `- Login endpoint: ${detection.loginMethod ?? "POST"} ${detection.loginEndpoint}` : "";
  const bodyInfo = detection.loginBody ? `- Detected login body format: ${detection.loginBody}` : "";
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Your ONLY mission is to create a test user in the running application so that DAST authentication can work.

## Context
- Base URL: ${baseUrl}
- Auth type: ${detection.authType}
${loginInfo}
${bodyInfo}

## Target credentials
Create a user with these exact credentials:
- username: bright_test
- email: bright@test.com
- password: BrightTest123!
- Make the user an admin/superuser if possible

**Credential consistency is mandatory:**
- Do NOT change the stored username or email to satisfy a login form. Keep username=bright_test and email=bright@test.com.
- If the app's login API calls the email field "username", use bright@test.com in the login request's "username" field \u2014 do NOT rewrite the database email to bright_test.
- Your final JSON must report the credentials that actually exist in the database after your changes.
- Before returning success, verify the exact reported username/email/password can authenticate, or explain why direct login verification is impossible.

**IMPORTANT:** Some applications have a built-in admin user (e.g. Grafana uses "admin/admin", Jenkins uses "admin"). In that case:
- Reset the built-in admin password to "BrightTest123!" instead of creating a new user
- Report the admin's actual username (e.g. "admin") in your output \u2014 do NOT assume it's "bright_test"
- If you can ALSO create a separate "bright_test" user, do that too, but prioritize getting working credentials

## Tools available
- **run_command_on_host** \u2014 Run shell commands on the host (docker ps, docker logs, etc.)
- **run_command_in_docker** \u2014 Run commands inside a Docker container (create users, framework CLI)
- **probe_url** \u2014 Make HTTP requests to the running app
- **read_file / search_files / list_files** \u2014 Inspect the codebase
- **search_web** \u2014 Search the internet for how to create users in this public OSS app/framework. Use when the codebase doesn't make user creation obvious or when initial attempts fail with unfamiliar errors. Never search local repo paths or internal service names.
- **fetch_url** \u2014 Fetch full content of a web page (docs, Stack Overflow). Large pages are saved to .bright-fetched-page.txt \u2014 use read_file to see full content.

## Strategy
1. Find the Docker container: run_command_on_host("docker ps --format '{{.ID}} {{.Names}} {{.Image}}'")
2. Research how to create users in this app:
   - search_files for User model, schema, migration
   - read_file on the User model to understand required fields, validations, password hashing
   - Check the framework (Gemfile, package.json, requirements.txt, etc.)
3. Create the user via docker exec + framework CLI. Common patterns:
   - **Rails**: run_command_in_docker(container: "<id>", command: "cd /src && RAILS_ENV=development bundle exec rails runner "u = User.new(username: :bright_test, email: :bright@test.com, password: :BrightTest123!, admin: true, active: true, approved: true); u.save!(validate: false)"")
   - **Django**: run_command_in_docker(container: "<id>", command: "python manage.py shell -c "from django.contrib.auth.models import User; User.objects.create_superuser('bright_test', 'bright@test.com', 'BrightTest123!')"")
   - **Laravel**: run_command_in_docker(container: "<id>", command: "php artisan tinker --execute="\\App\\Models\\User::create(['name'=>'bright','email'=>'bright@test.com','password'=>Hash::make('BrightTest123!')])"")
   - **Grafana**: run_command_in_docker(container: "<id>", command: "grafana-cli admin reset-admin-password 'BrightTest123!'") \u2014 username is "admin"
   - **Node/Express**: run_command_in_docker(container: "<id>", command: "node -e "const db = require('./models'); db.User.create({...})"")
   - **Apps with built-in admin**: Reset the admin password via CLI tool or direct DB update, then report the built-in username
4. **CRITICAL \u2014 Activate/confirm the user account:**
   Many apps require email verification before login works. After creating the user, you MUST ensure the account is fully activated:
   - **Rails**: run_command_in_docker to execute: "u = User.find_by(username: 'bright_test') || User.find_by(email: 'bright@test.com'); u.active = true; u.approved = true; u.save!(validate: false)" \u2014 also confirm email tokens if the model has them
   - **Django**: Ensure is_active=True (usually default for create_superuser)
   - **Laravel**: Set email_verified_at = now()
   - **Grafana**: Use grafana-cli admin reset-admin-password or the API: POST /api/admin/users with the provisioning API
   - **General**: Look for email_confirmed, verified, activated, or similar fields and set them to true
   - **Check**: After activation, verify by probing the login endpoint with the credentials
5. If the first attempt fails, READ the error message, then:
   - Read the User model source code to understand required fields and validations
   - Try save!(validate: false) or equivalent to bypass validations
   - **If you change the password to bypass validation, REMEMBER the new password \u2014 you must report it in the output**
   - Try alternative CLI commands (e.g. "bundle exec rake" vs "rails runner")
   - Try the app's built-in admin/seed commands
   - Try raw SQL: docker exec <db-container> psql -U postgres -d <dbname> -c "INSERT INTO users..."
6. VERIFY the user exists AND is activated:
   - Probe the login endpoint with the credentials (POST with username/password JSON or form data)
   - Or run a query inside the container to confirm the user exists

## Output
When the user is created and verified, respond with ONLY this JSON:
{"success": true, "username": "bright_test", "password": "<ACTUAL_PASSWORD>", "email": "bright@test.com"}

\u26A0\uFE0F CRITICAL: The "password" field MUST be the EXACT password that was saved to the database.
If you had to modify the password to bypass validations (e.g. changed "BrightTest123!" to "BrightTest123!__" or any other variant), report the MODIFIED password \u2014 NOT the original target.
The auth phase will use this password to log in. If it's wrong, authentication will silently fail.

If you exhausted all approaches and cannot create a user, respond with:
{"success": false, "reason": "brief explanation"}

## Rules
- Be persistent. Try at least 5 different approaches before giving up.
- Read error messages carefully \u2014 they tell you what fields are missing or what format is expected.
- When docker exec fails, check if the container is running and which shell/tools are available.
- Do NOT give up after one failure. Adapt and retry.`
    },
    {
      role: "user",
      content: "Create a test user in the running application. Return the JSON result."
    }
  ];
}
function repairBrokenLoginPrompt(baseUrl, diagnostic) {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer debugging a web application whose login endpoint is BROKEN (returning HTTP 500). Your mission is to diagnose and fix the issue so that login works.

## Situation
The application is running in Docker and serves pages, but the login endpoint crashes with a server error. This often happens when:
1. **Setup wizard incomplete** \u2014 The app is in first-run mode and requires initial setup (admin registration, config wizard) before normal login works. Look for setup/install/wizard routes.
2. **Database migrations missing** \u2014 Schema changes haven't been applied.
3. **Missing configuration** \u2014 Required environment variables, secrets, or config files are absent.
4. **Service dependencies** \u2014 A required service (Redis, Elasticsearch, etc.) is down or misconfigured.
5. **Asset compilation** \u2014 Frontend assets not compiled, app in wrong mode (development vs production).

## Pre-check diagnostic
${diagnostic}

## Tools available
- **run_command_on_host** \u2014 Run shell commands on the host (docker ps, docker logs, docker exec, curl, etc.)
- **run_command_in_docker** \u2014 Run commands inside a Docker container
- **probe_url** \u2014 Make HTTP requests to the running app (cookies tracked across calls)
- **read_file / search_files / list_files** \u2014 Inspect the application codebase
- **search_web** \u2014 Search the internet for solutions specific to this public OSS app/framework or generic error. Never search local repo paths or internal service names.
- **fetch_url** \u2014 Fetch documentation pages

## Strategy

### 1. Gather information
- Check container logs: \`docker logs <container> --tail 200\` for recent errors
- Check the app's routes/pages for setup wizards:
  - Probe GET ${baseUrl}/ and look for redirects to /setup, /install, /finish-installation, /wizard, etc.
  - Probe common setup URLs: ${baseUrl}/setup, ${baseUrl}/install, ${baseUrl}/finish-installation/register
  - Search codebase for setup/installation routes
- Check database state: look for pending migrations, empty tables
- Check service health: redis-cli ping, database connections, etc.

### 2. Fix the issue
Common fixes:
- **Complete setup wizard**: POST to the setup endpoint with admin credentials (e.g. register an admin user through the setup form)
- **Run migrations**: \`docker exec <container> <migration-command>\` (e.g., rails db:migrate, python manage.py migrate)
- **Set environment variables**: Restart container with correct env vars
- **Fix configuration/source code**: Prefer durable source-tree edits with \`edit_file\` over one-off edits inside a running container
- **Install missing dependencies**: apt-get install, npm install, bundle install
- **Restart services**: Restart the app process inside the container

### 3. Verify the fix
After each fix attempt:
1. Probe the login endpoint again to check if it still returns 500
2. If it now returns 200/302/403/422, the fix worked \u2192 success
3. If still 500, check logs for the NEW error and try a different approach

## Output
When the login endpoint is functional (no longer returning 5xx), respond with:
{"fixed": true, "action": "brief description of what you did"}

If you found the source/config fix but it requires a full rebuild/recreate before it can be verified, respond with:
{"fixed": false, "needsRebuild": true, "rebuildHint": "exact source/config change needed and why a full Docker rebuild/restart is required"}

If you exhausted all approaches, respond with:
{"fixed": false, "reason": "brief explanation of what's wrong"}

## Rules
- Be persistent. Try at least 5 different diagnostic/fix approaches before giving up.
- READ error messages and logs carefully \u2014 they tell you exactly what's wrong.
- Prefer source-level repairs using edit_file. Avoid container-only source patches unless you can verify they affected the running app; production images often ignore in-place rebuild attempts.
- After each fix attempt, ALWAYS re-probe the login endpoint to verify.
- Focus on making login FUNCTIONAL, not perfect. A 403 "bad CSRF" or 422 "invalid credentials" means the endpoint WORKS.
- You have up to 30 rounds. Use them wisely \u2014 diagnose first, then fix.`
    },
    {
      role: "user",
      content: `The login endpoint is broken. Diagnose and fix the application. Base URL: ${baseUrl}`
    }
  ];
}

// src/phases/auth.ts
var CONTENT_TYPE_MAP = {
  json: "application/json",
  form: "application/x-www-form-urlencoded",
  xml: "application/xml"
};
function compactAuthHint(hint, max = 500) {
  return hint.replace(/\s+/g, " ").trim().slice(0, max);
}
function addAuthHint(hints, hint, opts = {}) {
  if (!hints) return;
  const compacted = compactAuthHint(hint, 900);
  if (!compacted) return;
  if (hints.some((existing) => existing === compacted || existing.includes(compacted) || compacted.includes(existing))) {
    return;
  }
  hints.push(compacted);
  if (!opts.silent) {
    console.log(`[Auth] Saved hint: ${compacted.slice(0, 200)}`);
  }
}
function removeAuthHint(hints, hint) {
  if (!hints) return;
  const needle = compactAuthHint(hint, 900);
  const idx = hints.findIndex((existing) => existing.includes(needle) || needle.includes(existing));
  if (idx !== -1) {
    console.log(`[Auth] Removed hint: ${hints[idx].slice(0, 200)}`);
    hints.splice(idx, 1);
  }
}
function dedupeAuthHints(hints) {
  const deduped = [];
  for (const hint of hints) {
    addAuthHint(deduped, hint);
  }
  return deduped;
}
function formatAuthHints(hints) {
  return hints.map((hint, i) => `${i + 1}. ${hint}`).join("\n");
}
async function detectAndConfigureAuth(llm, repoPath, techStack, projectId, baseUrl, repeaterId, api, model, contextSummary, initialAuthHints = []) {
  const authHints = dedupeAuthHints(initialAuthHints);
  const detection = await detectAuthFromCode(
    llm,
    repoPath,
    techStack,
    baseUrl,
    model,
    contextSummary
  );
  if (!detection.requiresAuth) {
    console.log("[Auth] No auth required");
    return { authObjectId: void 0, hasAuth: false, authFailed: false, authHints };
  }
  console.log(
    `[Auth] Detected auth: ${detection.authType} \u2014 ${detection.notes}`
  );
  console.log(
    `[Auth] loginEndpoint=${detection.loginEndpoint}, protectedEndpoint=${detection.protectedEndpointPath}`
  );
  console.log(
    `[Auth] loginContentType=${detection.loginContentType}, tokenEmbedLocation=${detection.tokenEmbedLocation}`
  );
  addAuthHint(
    authHints,
    `[auth-detection] ${detection.authType} auth uses ${detection.loginMethod ?? "POST"} ${detection.loginEndpoint ?? "unknown"} with ${detection.loginContentType} body ${detection.loginBody ?? "unknown"}. Token location=${detection.tokenLocation}, field/header=${detection.tokenFieldPath ?? detection.headerName ?? "unknown"}, request header=${detection.headerName ?? "Authorization"}, prefix=${JSON.stringify(detection.headerPrefix ?? "")}.`
  );
  if (detection.authType === "oauth" || detection.authType === "api_key") {
    const grantType = detection.oauthGrantType ?? null;
    console.log(`[Auth] API auth detected (type=${detection.authType}, grant=${grantType ?? "n/a"}) \u2014 seeding credentials`);
    if (detection.oauthTokenEndpoint) {
      addAuthHint(authHints, `[auth-oauth] OAuth2 token endpoint: ${detection.oauthTokenEndpoint}. Reported grant type: ${grantType ?? "unknown"}.`);
    }
    if (detection.oauthClientId) {
      addAuthHint(authHints, `[auth-oauth-client] Found OAuth2 client in codebase: id=${detection.oauthClientId}, secret=${detection.oauthClientSecret ?? "unknown"}.`);
    }
    if (!detection.oauthClientId || !detection.oauthClientSecret) {
      const oauthClient = await seedOAuthClient(llm, repoPath, baseUrl, detection, model);
      if (oauthClient) {
        detection.oauthClientId = oauthClient.clientId;
        detection.oauthClientSecret = oauthClient.clientSecret;
        if (oauthClient.tokenEndpoint) {
          detection.oauthTokenEndpoint = oauthClient.tokenEndpoint;
        }
        addAuthHint(authHints, `[auth-seeded-client] Seeded OAuth2 client: id=${oauthClient.clientId}, secret=${oauthClient.clientSecret}${oauthClient.tokenEndpoint ? `, tokenEndpoint=${oauthClient.tokenEndpoint}` : ""}. These can be used for OIDC token exchange OR as static header values (x-cal-client-id / x-cal-secret-key / etc).`);
      } else {
        console.warn("[Auth] Could not seed OAuth client \u2014 LLM will try to create one during auth config");
      }
    }
    if (grantType === "password") {
      console.log("[Auth] Password grant hint \u2014 seeding test user for resource owner credentials");
      if (detection.loginBody) {
        addAuthHint(authHints, `[auth-oauth-user] Resource owner credentials from detection: ${detection.loginBody}`);
      }
    }
    const probeContext2 = await preProbeForAuth(baseUrl, detection);
    const verifiedTestUrl2 = await resolveVerifiedAuthTestUrl(
      llm,
      repoPath,
      baseUrl,
      detection,
      model,
      probeContext2
    );
    if (verifiedTestUrl2) {
      addAuthHint(authHints, `[auth-test-url] Verified Bright auth validation URL is ${verifiedTestUrl2.testUrl}. Evidence: ${verifiedTestUrl2.evidence}`);
    }
    const MAX_AUTH_ATTEMPTS2 = 3;
    let authObjectId2;
    let capturedDirectHeaders2;
    const allAttemptLogs2 = [];
    let fullProbeContext2 = probeContext2;
    fullProbeContext2 += verifiedTestUrl2 ? `

### Verified auth test URL
${verifiedTestUrl2.testUrl}
Evidence: ${verifiedTestUrl2.evidence}` : "\n\n### Verified auth test URL\nNo verified test URL was found. Use probe_url to find a protected endpoint that returns 401 without auth.";
    for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS2; attempt++) {
      let attemptContext = fullProbeContext2;
      if (allAttemptLogs2.length > 0) {
        attemptContext += "\n\n## Previous attempt failures\nLearn from these mistakes. Do NOT repeat the same configurations.\n\n" + allAttemptLogs2.join("\n\n---\n\n");
      }
      if (authHints.length > 0) {
        attemptContext += "\n\n## Saved auth hints\n" + formatAuthHints(authHints);
      }
      console.log(`[Auth] API auth configuration attempt ${attempt}/${MAX_AUTH_ATTEMPTS2}...`);
      const result = await createAuthViaMcp(
        llm,
        repoPath,
        detection,
        false,
        projectId,
        baseUrl,
        repeaterId,
        api,
        model,
        attemptContext,
        verifiedTestUrl2?.testUrl,
        authHints
      );
      if (result.infraRepairHint) {
        console.warn(`[Auth] API auth LLM requested infra repair: ${result.infraRepairHint.slice(0, 200)}`);
        return { authObjectId: void 0, hasAuth: false, authFailed: true, authHints, infraRepairHint: result.infraRepairHint };
      }
      if (result.authId) {
        authObjectId2 = result.authId;
        if (result.directAuthHeaders) {
          capturedDirectHeaders2 = result.directAuthHeaders;
        }
        break;
      }
      allAttemptLogs2.push(...result.attemptLog);
    }
    if (authObjectId2) {
      console.log(`[Auth] API auth configured successfully: ${authObjectId2}`);
      return { authObjectId: authObjectId2, hasAuth: true, authFailed: false, authHints, directAuthHeaders: capturedDirectHeaders2 };
    }
    console.error("[Auth] API auth configuration failed after all attempts");
    return { authObjectId: void 0, hasAuth: false, authFailed: true, authHints };
  }
  let registrationOk = await registerUser(baseUrl, detection);
  if (registrationOk) {
    updateLoginBodyFromRegisteredUser(detection);
    addAuthHint(authHints, `[auth-registration] HTTP registration succeeded. Use registered test credentials in login body: ${detection.loginBody ?? "unknown"}.`);
  }
  let seededCredentials;
  if (!registrationOk) {
    seededCredentials = await seedTestUser(llm, repoPath, baseUrl, detection, model);
    if (seededCredentials?.success) {
      registrationOk = true;
      updateLoginBodyFromSeededUser(detection, seededCredentials);
      detection.notes = `${detection.notes}
Seeded credentials: username=${seededCredentials.username}, email=${seededCredentials.email}, password=${seededCredentials.password}. Use the app's actual login identifier field; do not mutate the stored username/email.`;
      addAuthHint(
        authHints,
        `[auth-seed] Seeded credentials are username=${seededCredentials.username}, email=${seededCredentials.email}, password=${seededCredentials.password}. Preserve the app's detected login field names in the login body: ${detection.loginBody ?? "unknown"}.`
      );
      if (!detection.loginEndpoint || isSetupLikeEndpoint(detection.loginEndpoint)) {
        const discovered = await discoverLoginEndpoint(baseUrl, detection.loginEndpoint ?? void 0);
        if (discovered) {
          if (detection.loginEndpoint && detection.loginEndpoint !== discovered) {
            console.log(`[Auth] Replaced setup-like login endpoint ${detection.loginEndpoint} \u2192 ${discovered}`);
          }
          detection.loginEndpoint = discovered;
          console.log(`[Auth] Discovered login endpoint: ${discovered}`);
        }
      }
      const credCheck = await verifySeededCredentials(baseUrl, seededCredentials, detection);
      if (!credCheck.valid) {
        console.warn(`[Auth:Seed] Credential verification failed: ${credCheck.reason}`);
        if (credCheck.reason.startsWith("not_activated")) {
          console.log("[Auth:Seed] User not activated \u2014 re-running seed with activation hint");
          const activationResult = await seedTestUser(
            llm,
            repoPath,
            baseUrl,
            detection,
            model,
            `IMPORTANT: The test user "${seededCredentials.username}" was created but is NOT ACTIVATED. The login endpoint returned: "not_activated". You MUST activate/confirm the user's email before returning. Common methods: rails runner "User.find_by(email:'${seededCredentials.email ?? seededCredentials.username}')&.activate", Django: User.objects.filter(email='...').update(is_active=True), or update the database directly. Do NOT create a new user \u2014 just activate the existing one.`
          );
          if (activationResult?.success) {
            const recheck = await verifySeededCredentials(baseUrl, seededCredentials, detection);
            if (recheck.valid) {
              console.log("[Auth:Seed] Post-activation verification passed");
            } else {
              console.warn(`[Auth:Seed] Post-activation verification still failed: ${recheck.reason}`);
              registrationOk = false;
            }
          } else {
            console.warn("[Auth:Seed] Activation re-seed failed");
            registrationOk = false;
          }
        } else {
          console.warn("[Auth:Seed] The seed LLM may have changed the password \u2014 seeded password might not match");
          registrationOk = false;
        }
      } else {
        console.log("[Auth:Seed] Credential verification passed \u2014 login works");
      }
    }
  }
  const seedCommands = seededCredentials?.seedCommands;
  const probeContext = await preProbeForAuth(baseUrl, detection);
  let loginCheck = await preAuthLoginSanityCheck(baseUrl, detection);
  if (!loginCheck.functional) {
    console.warn("[Auth] Login endpoint broken \u2014 attempting repair...");
    const repair = await repairBrokenLogin(
      llm,
      repoPath,
      baseUrl,
      loginCheck.diagnostic,
      model
    );
    if (repair.fixed) {
      loginCheck = await preAuthLoginSanityCheck(baseUrl, detection);
      if (!loginCheck.functional) {
        console.error("[Auth] Login still broken after repair attempt \u2014 aborting auth");
        return {
          authObjectId: void 0,
          hasAuth: false,
          authFailed: true,
          registration: void 0,
          seedCommands,
          authHints,
          infraRepairHint: repair.infraRepairHint ?? `Login endpoint is still returning 5xx after repair. Apply source-level fixes durably, rebuild the app image, restart the app, and re-run auth. Diagnostic:
${loginCheck.diagnostic}`
        };
      }
      console.log("[Auth] Login repaired successfully \u2014 proceeding with auth setup");
    } else {
      console.error("[Auth] Could not repair login endpoint \u2014 aborting auth");
      return {
        authObjectId: void 0,
        hasAuth: false,
        authFailed: true,
        registration: void 0,
        seedCommands,
        authHints,
        infraRepairHint: repair.infraRepairHint ?? `Login endpoint is returning 5xx and could not be repaired in the running app. Apply a source-level fix, rebuild/recreate the application containers, then retry auth. Diagnostic:
${loginCheck.diagnostic}`
      };
    }
  }
  const verifiedTestUrl = await resolveVerifiedAuthTestUrl(
    llm,
    repoPath,
    baseUrl,
    detection,
    model,
    probeContext + (loginCheck.diagnostic ? `

${loginCheck.diagnostic}` : "")
  );
  if (verifiedTestUrl) {
    addAuthHint(
      authHints,
      `[auth-test-url] Verified Bright auth validation URL is ${verifiedTestUrl.testUrl}. Do not mutate or re-encode it into a different identity. Evidence: ${verifiedTestUrl.evidence}`
    );
  }
  const MAX_AUTH_ATTEMPTS = 3;
  let authObjectId;
  let capturedDirectHeaders;
  const allAttemptLogs = [];
  let fullProbeContext = loginCheck.diagnostic ? probeContext + "\n\n" + loginCheck.diagnostic : probeContext;
  fullProbeContext += verifiedTestUrl ? `

### Verified auth test URL
${verifiedTestUrl.testUrl}
Evidence: ${verifiedTestUrl.evidence}` : "\n\n### Verified auth test URL\nNo verified test URL was found before auth configuration. You MUST use probe_url and test_auth_object feedback to choose a user-accessible protected endpoint; do not use guessed placeholder values.";
  let infraRepairHint;
  for (let attempt = 1; attempt <= MAX_AUTH_ATTEMPTS; attempt++) {
    let attemptContext = fullProbeContext;
    if (allAttemptLogs.length > 0) {
      attemptContext += "\n\n## Previous attempt failures\nLearn from these mistakes. Do NOT repeat the same configurations.\n\n" + allAttemptLogs.join("\n\n---\n\n");
    }
    if (authHints.length > 0) {
      attemptContext += "\n\n## Saved auth hints\nThese are durable facts from scan preparation, auth detection, verified probes, and previous auth attempts. Treat them as higher priority than guesses.\n" + formatAuthHints(authHints);
    }
    console.log(`[Auth] Auth configuration attempt ${attempt}/${MAX_AUTH_ATTEMPTS}...`);
    const result = await createAuthViaMcp(
      llm,
      repoPath,
      detection,
      registrationOk,
      projectId,
      baseUrl,
      repeaterId,
      api,
      model,
      attemptContext,
      verifiedTestUrl?.testUrl,
      authHints
    );
    if (result.authId) {
      authObjectId = result.authId;
      if (result.directAuthHeaders) {
        capturedDirectHeaders = result.directAuthHeaders;
      }
      break;
    }
    if (result.infraRepairHint) {
      infraRepairHint = result.infraRepairHint;
      console.log(`[Auth] Infrastructure repair requested \u2014 breaking out of auth loop`);
      break;
    }
    if (result.attemptLog.length > 0) {
      allAttemptLogs.push(`### Attempt ${attempt} failures:
${result.attemptLog.join("\n")}`);
    }
    if (attempt < MAX_AUTH_ATTEMPTS) {
      console.log(`[Auth] Attempt ${attempt} failed \u2014 retrying with accumulated context...`);
    }
  }
  const registration = detection.registerEndpoint && detection.registerBody ? {
    baseUrl,
    endpoint: detection.registerEndpoint,
    method: detection.registerMethod ?? "POST",
    body: detection.registerBody,
    contentType: detection.registerContentType ?? detection.loginContentType
  } : void 0;
  if (authObjectId) {
    console.log(`[Auth] Auth configured successfully: ${authObjectId}`);
    return { authObjectId, hasAuth: true, authFailed: false, registration, seedCommands, authHints, directAuthHeaders: capturedDirectHeaders };
  }
  if (infraRepairHint) {
    console.error(`[Auth] Failed \u2014 infrastructure repair needed: ${infraRepairHint.slice(0, 200)}`);
    return {
      authObjectId: void 0,
      hasAuth: false,
      authFailed: true,
      registration,
      authHints,
      infraRepairHint
    };
  }
  console.error("[Auth] Failed to configure auth");
  return {
    authObjectId: void 0,
    hasAuth: false,
    authFailed: true,
    registration,
    authHints
  };
}
async function detectAuthFromCode(llm, repoPath, techStack, baseUrl, model, contextSummary) {
  const stackStr = formatTechStack(techStack);
  const codeHandler = createToolHandler(repoPath);
  _probeCookieJar = {};
  const probeToolDef = {
    type: "function",
    function: {
      name: "probe_url",
      description: "Make an HTTP request to the RUNNING application and see the response (status, headers, body). Use this to verify auth requirements \u2014 e.g. GET a protected endpoint and check for 401/403/302/login_required.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Full URL (e.g. http://localhost:3000/admin)" },
          method: { type: "string", enum: ["GET", "POST", "PUT", "DELETE"], description: "HTTP method. Default: GET" },
          headers: { type: "string", description: `JSON headers, e.g. '{"Accept":"application/json"}'` },
          body: { type: "string", description: "Request body for POST/PUT" }
        },
        required: ["url"],
        additionalProperties: false
      }
    }
  };
  const messages = detectAuthPrompt(stackStr, baseUrl, contextSummary);
  const webHandler = createWebSearchHandler(repoPath);
  const response = await chatWithTools(
    llm,
    messages,
    [...codebaseTools, probeToolDef, ...webSearchTools],
    (name, args) => {
      if (name === "probe_url") return probeUrl2(args);
      if (name === "search_web" || name === "fetch_url") return webHandler(name, args);
      return codeHandler(name, args);
    },
    model,
    40
  );
  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      requiresAuth: parsed.requiresAuth ?? true,
      authType: parsed.authType ?? "none",
      loginEndpoint: parsed.loginEndpoint ?? null,
      loginMethod: parsed.loginMethod ?? "POST",
      loginBody: parsed.loginBody ?? null,
      loginContentType: parsed.loginContentType ?? "json",
      tokenLocation: parsed.tokenLocation ?? "body",
      tokenFieldPath: parsed.tokenFieldPath ?? null,
      tokenEmbedLocation: parsed.tokenEmbedLocation ?? "header",
      headerName: parsed.headerName ?? "Authorization",
      headerPrefix: parsed.headerPrefix ?? "Bearer ",
      cookieName: parsed.cookieName ?? null,
      queryParamName: parsed.queryParamName ?? null,
      reauthIndicator: parsed.reauthIndicator ?? "status",
      reauthBodyPattern: parsed.reauthBodyPattern ?? null,
      protectedEndpointPath: parsed.protectedEndpointPath ?? null,
      registerEndpoint: parsed.registerEndpoint ?? null,
      registerMethod: parsed.registerMethod ?? "POST",
      registerBody: parsed.registerBody ?? null,
      registerContentType: parsed.registerContentType ?? null,
      csrfRequired: parsed.csrfRequired ?? false,
      csrfFieldName: parsed.csrfFieldName ?? null,
      csrfFormUrl: parsed.csrfFormUrl ?? null,
      csrfDelivery: parsed.csrfDelivery ?? null,
      csrfExtractPattern: parsed.csrfExtractPattern ?? null,
      oauthTokenEndpoint: parsed.oauthTokenEndpoint ?? null,
      oauthClientId: parsed.oauthClientId ?? null,
      oauthClientSecret: parsed.oauthClientSecret ?? null,
      oauthScope: parsed.oauthScope ?? null,
      oauthGrantType: parsed.oauthGrantType ?? null,
      notes: parsed.notes ?? ""
    };
  } catch {
    console.warn(
      "[Auth] Could not parse detection response \u2014 defaulting to requiresAuth:true:",
      response.slice(0, 300)
    );
    return {
      requiresAuth: true,
      authType: "session",
      loginEndpoint: null,
      loginMethod: null,
      loginBody: null,
      loginContentType: "json",
      tokenLocation: "body",
      tokenFieldPath: null,
      tokenEmbedLocation: "header",
      headerName: null,
      headerPrefix: null,
      cookieName: null,
      queryParamName: null,
      reauthIndicator: "status",
      reauthBodyPattern: null,
      protectedEndpointPath: null,
      registerEndpoint: null,
      registerMethod: null,
      registerBody: null,
      registerContentType: null,
      csrfRequired: false,
      csrfFieldName: null,
      csrfFormUrl: null,
      csrfDelivery: null,
      csrfExtractPattern: null,
      oauthTokenEndpoint: null,
      oauthClientId: null,
      oauthClientSecret: null,
      oauthScope: null,
      oauthGrantType: null,
      notes: "Detection parse failed \u2014 assuming auth required"
    };
  }
}
async function createAuthViaRestApi(api, projectId, repeaterId, params) {
  const { authStyle, loginUrl, loginBody, loginContentType, testUrl } = params;
  const contentType = loginContentType === "form" ? "application/x-www-form-urlencoded" : "application/json";
  const normalizedBody = normalizeBody(loginBody, loginContentType);
  if (authStyle === "api_key") {
    const body2 = {
      name: "Engine Auth \u2014 api_key",
      projectId,
      type: "header",
      test: {
        repeaterId,
        request: { method: "GET", url: testUrl }
      },
      successResponseDetection: [{ type: "status", statuses: [200] }],
      reauthTriggers: [
        { type: "TRIGGER", location: "status", statuses: [401, 403] }
      ],
      config: {
        request: {
          url: testUrl,
          method: "GET",
          headers: [
            {
              name: params.headerName ?? "Authorization",
              value: params.headerValue ?? "",
              type: "clear_text"
            }
          ]
        }
      }
    };
    return postAuthObject(api, body2);
  }
  const isSession = authStyle === "session";
  const reauthStrat = params.reauthStrategy ?? (isSession ? "both" : "status");
  let loginBodyTrigger = null;
  if (isSession) {
    try {
      const loginPath = new URL(loginUrl).pathname;
      const escaped = loginPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      loginBodyTrigger = {
        type: "TRIGGER",
        location: "body",
        patterns: [`action=["'][^"']*${escaped}["']`]
      };
    } catch {
    }
  }
  let reauthTriggers;
  if (reauthStrat === "body" && params.reauthBodyPattern) {
    reauthTriggers = [
      { type: "TRIGGER", location: "body", patterns: [params.reauthBodyPattern] }
    ];
  } else if (reauthStrat === "redirect") {
    reauthTriggers = [
      { type: "TRIGGER", location: "header", name: "Location", patterns: ["login|signin|sign_in|auth"] },
      ...loginBodyTrigger ? [{ type: "OR" }, loginBodyTrigger] : []
    ];
  } else if (reauthStrat === "both") {
    reauthTriggers = [
      { type: "TRIGGER", location: "status", statuses: [401, 403] },
      { type: "OR" },
      { type: "TRIGGER", location: "header", name: "Location", patterns: ["login|signin|sign_in|auth"] },
      ...loginBodyTrigger ? [{ type: "OR" }, loginBodyTrigger] : []
    ];
  } else {
    reauthTriggers = [
      { type: "TRIGGER", location: "status", statuses: [401, 403] }
    ];
  }
  const embedders = [];
  const tokenLocation = params.tokenLocation ?? "body";
  if (!isSession && params.tokenFieldPath) {
    const requestHeaderName = params.headerName || "Authorization";
    const headerPrefix = params.headerPrefix ?? (requestHeaderName.toLowerCase() === "authorization" ? "Bearer " : "");
    const template = tokenLocation === "header" ? `${headerPrefix}${brightHeaderInterpolation("login", params.tokenFieldPath || requestHeaderName, headerTokenRegex(headerPrefix))}` : `${headerPrefix}{{ auth_object.stages.login.response.body | match:/${bodyTokenRegex(params.tokenFieldPath)}/ }}`;
    embedders.push({
      type: "header",
      name: requestHeaderName,
      template,
      templateType: "clear_text",
      mergeStrategy: "replace"
    });
  }
  const redirectOpts = isSession ? { followRedirects: false, maxRedirects: 0, changeMethodOnRedirect: false } : {};
  if (params.csrfUrl && !params.csrfExtractPattern) {
    const detectedPattern = await autoProbeCsrf(params.csrfUrl);
    if (detectedPattern) {
      params.csrfExtractPattern = detectedPattern;
    }
  }
  if (isSession && params.csrfUrl) {
    const headerName = params.csrfHeaderName || "X-CSRF-Token";
    const extractPattern = params.csrfExtractPattern || '"csrf"\\s*:\\s*"([^"]*)"';
    embedders.push({
      type: "header",
      name: headerName,
      template: `{{ auth_object.stages.get_csrf.response.body | match:/${extractPattern}/ }}`,
      templateType: "clear_text",
      mergeStrategy: "replace"
    });
  }
  const body = {
    name: `Engine Auth \u2014 ${authStyle}`,
    projectId,
    type: "multistep",
    test: {
      repeaterId,
      request: {
        method: "GET",
        url: testUrl,
        protocol: "http",
        bodyType: "clear_text",
        // For session auth: follow redirects so Bright sees the final page
        // (login page vs protected page) rather than a raw 302. This lets the
        // body reauthTrigger detect unauthenticated state, and lets Bright
        // compare validation (login page) vs authorization (protected page).
        // Login steps still use followRedirects:false to capture raw Set-Cookie.
        ...isSession ? { followRedirects: true } : {}
      }
    },
    successResponseDetection: [{ type: "status", statuses: [200] }],
    reauthTriggers,
    config: {
      multistep: {
        steps: buildLoginSteps({
          cookieUrl: params.cookieUrl,
          csrfUrl: params.csrfUrl,
          csrfHeaderName: params.csrfHeaderName,
          csrfExtractPattern: params.csrfExtractPattern,
          loginUrl,
          loginAccept: params.loginAccept,
          contentType,
          normalizedBody,
          isSession,
          redirectOpts
        }),
        ...embedders.length > 0 ? { embedders } : {}
      }
    }
  };
  console.log(
    `[Auth] Creating ${authStyle} auth via REST API \u2014 login: ${loginUrl}, test: ${testUrl}${params.cookieUrl ? `, cookie: ${params.cookieUrl}` : ""}${params.csrfUrl ? `, csrf: ${params.csrfUrl}` : ""}${params.csrfExtractPattern ? `, csrfPattern: ${params.csrfExtractPattern}` : ""}`
  );
  const steps = body.config.multistep ? body.config.multistep.steps : void 0;
  if (steps) {
    console.log(`[Auth] Auth object steps: ${steps.map((s) => `${s.name}(${s.request?.method} ${s.request?.url})`).join(" \u2192 ")}`);
  }
  return postAuthObject(api, body);
}
function bodyTokenRegex(tokenFieldPath) {
  const lastSegment = tokenFieldPath.includes(".") ? tokenFieldPath.split(".").pop() : tokenFieldPath;
  const escaped = lastSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `"${escaped}"\\s*:\\s*"([^"]*)"`;
}
function headerTokenRegex(headerPrefix) {
  const trimmedPrefix = headerPrefix.trim();
  if (!trimmedPrefix) {
    return "(.+)";
  }
  const escapedPrefix = trimmedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(?:${escapedPrefix}\\s+)?([^\\s,;]+)`;
}
function normalizeResponseHeaderName(headerName) {
  if (headerName.toLowerCase() === "authorization") {
    return "Authorization";
  }
  return headerName;
}
function brightHeaderInterpolation(stageName, headerName, regex) {
  const normalizedHeader = normalizeResponseHeaderName(headerName);
  const escapedHeader = normalizedHeader.replace(/'/g, "\\'");
  return `{{ auth_object.stages.${stageName}.response.headers | get: '/${escapedHeader}' | match:/${regex}/ }}`;
}
function buildLoginSteps(opts) {
  const steps = [];
  if (opts.csrfUrl) {
    steps.push({
      name: "get_csrf",
      request: {
        method: "GET",
        url: opts.csrfUrl,
        protocol: "http",
        headers: [
          {
            name: "Accept",
            value: "application/json",
            type: "clear_text",
            mergeStrategy: "replace"
          }
        ],
        bodyType: "clear_text"
        // Do NOT spread redirectOpts here — followRedirects:false is for the
        // login POST (to capture raw 302 + Set-Cookie). The CSRF GET should
        // follow redirects normally so the token fetch succeeds.
      },
      successResponseDetection: [{ type: "status", statuses: [200] }]
    });
  }
  if (opts.cookieUrl) {
    steps.push({
      name: "init_session",
      request: {
        method: "GET",
        url: opts.cookieUrl,
        protocol: "http",
        bodyType: "clear_text"
      },
      successResponseDetection: [{ type: "status", statuses: [200] }]
    });
  }
  const loginHeaders = [
    {
      name: "Content-Type",
      value: opts.contentType,
      type: "clear_text",
      mergeStrategy: "replace"
    }
  ];
  if (opts.loginAccept) {
    loginHeaders.push({
      name: "Accept",
      value: opts.loginAccept,
      type: "clear_text",
      mergeStrategy: "replace"
    });
  }
  if (opts.csrfUrl) {
    const headerName = opts.csrfHeaderName || "X-CSRF-Token";
    const extractPattern = opts.csrfExtractPattern || '"csrf"\\s*:\\s*"([^"]*)"';
    loginHeaders.push({
      name: headerName,
      value: `{{ auth_object.stages.get_csrf.response.body | match:/${extractPattern}/ }}`,
      type: "clear_text",
      mergeStrategy: "replace"
    });
  }
  steps.push({
    name: "login",
    request: {
      method: "POST",
      url: opts.loginUrl,
      protocol: "http",
      headers: loginHeaders,
      bodyType: "clear_text",
      body: opts.normalizedBody,
      ...opts.redirectOpts
    },
    successResponseDetection: [
      {
        type: "status",
        statuses: opts.isSession ? [200, 201, 302] : [200, 201]
      }
    ]
  });
  return steps;
}
async function postAuthObject(api, body) {
  try {
    const res = await fetch(`https://${api.brightHostname}/api/v3/auth-objects`, {
      method: "POST",
      headers: {
        Authorization: `Api-Key ${api.brightToken}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { error: `HTTP ${res.status}: ${text.slice(0, 500)}` };
    }
    const data = await res.json();
    return { id: data.id ?? data.authObjectId };
  } catch (err) {
    return { error: `Request failed: ${err}` };
  }
}
async function resolveVerifiedAuthTestUrl(llm, repoPath, baseUrl, detection, model, context) {
  console.log("[Auth] Resolving verified auth test URL...");
  let lastVerified;
  const fallbackCandidate = resolveProtectedEndpointPath(detection) ? `${baseUrl}${resolveProtectedEndpointPath(detection)}` : null;
  const verifyTool = {
    type: "function",
    function: {
      name: "verify_auth_test_url",
      description: "Verify that a candidate protected URL is usable for Bright auth validation. This logs in with the detected credentials internally, applies the returned token/cookies, then compares unauthenticated vs authenticated responses.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Full candidate protected URL to verify"
          },
          method: {
            type: "string",
            enum: ["GET", "POST"],
            description: "HTTP method for the protected URL. Default: GET"
          },
          reason: {
            type: "string",
            description: "Why this URL should be accessible to the configured test user"
          }
        },
        required: ["url"],
        additionalProperties: false
      }
    }
  };
  const messages = [
    {
      role: "system",
      content: `You resolve the exact protected URL Bright should use to validate authentication.

Do NOT guess route parameter values. Inspect code and use live probes. If a route has placeholders like :email, :username, :id, {email}, or {userId}, determine the correct value from the route/controller/service code and the configured test credentials.

You MUST call verify_auth_test_url for candidate URLs. A good URL:
- returns 401/403 or another clearly unauthenticated response without login
- after login with the configured credentials, returns non-401/403 and not the same Forbidden body
- is accessible to the configured test user; avoid admin/role-specific endpoints unless the test user has that role

If no URL can be verified, return verified=false. Do not return a guessed URL as verified.`
    },
    {
      role: "user",
      content: `Base URL: ${baseUrl}
Detected protected endpoint path: ${detection.protectedEndpointPath ?? "unknown"}
Fallback candidate from local placeholder substitution (UNVERIFIED; inspect/verify before using): ${fallbackCandidate ?? "none"}
Login endpoint: ${detection.loginMethod ?? "POST"} ${detection.loginEndpoint ?? "unknown"}
Login content type: ${detection.loginContentType}
Login body/credentials: ${detection.loginBody ?? "unknown"}
Auth type: ${detection.authType}
Token location: ${detection.tokenLocation}
Token field/header: ${detection.tokenFieldPath ?? detection.headerName ?? "unknown"}
Notes: ${detection.notes}

${context ? `Existing probe context:
${context}
` : ""}

Return JSON only:
{
  "verified": true/false,
  "testUrl": "http://localhost:3000/verified/protected/url" or null,
  "evidence": "short explanation with unauth/auth status codes",
  "reason": "why no URL was verified, if verified=false"
}`
    }
  ];
  const codeHandler = createToolHandler(repoPath);
  const handler = async (name, args) => {
    if (name === "probe_url") return probeUrl2(args);
    if (name === "verify_auth_test_url") {
      const result = await verifyAuthTestUrl(
        baseUrl,
        detection,
        String(args.url ?? ""),
        String(args.method ?? "GET")
      );
      if (result.verified) {
        lastVerified = { testUrl: result.url, evidence: result.evidence };
      }
      return JSON.stringify(result, null, 2);
    }
    return codeHandler(name, args);
  };
  const response = await chatWithTools(
    llm,
    messages,
    [...codebaseTools, probeUrlTool, verifyTool],
    handler,
    model,
    20
  );
  try {
    const parsed = JSON.parse(extractJson(response));
    if (parsed.verified && parsed.testUrl) {
      const verified = {
        testUrl: parsed.testUrl,
        evidence: parsed.evidence ?? "verified by resolver"
      };
      console.log(`[Auth] Verified auth test URL: ${verified.testUrl} \u2014 ${verified.evidence}`);
      return verified;
    }
    if (lastVerified) {
      console.log(`[Auth] Using last tool-verified auth test URL: ${lastVerified.testUrl} \u2014 ${lastVerified.evidence}`);
      return lastVerified;
    }
    console.warn(`[Auth] Could not verify auth test URL: ${parsed.reason ?? response.slice(0, 200)}`);
    return void 0;
  } catch {
    if (lastVerified) {
      console.log(`[Auth] Using last tool-verified auth test URL: ${lastVerified.testUrl} \u2014 ${lastVerified.evidence}`);
      return lastVerified;
    }
    console.warn(`[Auth] Could not parse auth test URL resolver response: ${response.slice(0, 200)}`);
    return void 0;
  }
}
async function verifyAuthTestUrl(baseUrl, detection, candidateUrl, method) {
  if (!candidateUrl) {
    return { verified: false, url: candidateUrl, evidence: "missing URL", reason: "missing URL" };
  }
  if (!detection.loginEndpoint) {
    return { verified: false, url: candidateUrl, evidence: "missing login endpoint", reason: "missing login endpoint" };
  }
  const url = new URL(candidateUrl, baseUrl).toString();
  const requestMethod = method.toUpperCase() === "POST" ? "POST" : "GET";
  const preview = (body) => body.replace(/\s+/g, " ").slice(0, 160);
  try {
    const unauth = await fetch(url, {
      method: requestMethod,
      headers: { Accept: "application/json, text/plain, */*" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
    });
    const unauthBody = await unauth.text().catch(() => "");
    const loginUrl = `${baseUrl}${detection.loginEndpoint}`;
    const loginContentType = detection.loginContentType === "form" ? "application/x-www-form-urlencoded" : "application/json";
    const login = await fetch(loginUrl, {
      method: detection.loginMethod ?? "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": loginContentType
      },
      body: normalizeBody(detection.loginBody ?? "{}", detection.loginContentType),
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
    });
    const loginBody = await login.text().catch(() => "");
    if (login.status >= 400) {
      return {
        verified: false,
        url,
        unauthStatus: unauth.status,
        loginStatus: login.status,
        evidence: `unauth=${unauth.status}, login=${login.status}`,
        reason: `login failed: ${preview(loginBody)}`
      };
    }
    const authHeaders = { Accept: "application/json, text/plain, */*" };
    const tokenHeaderName = detection.tokenLocation === "header" ? detection.tokenFieldPath ?? detection.headerName ?? "Authorization" : void 0;
    const tokenHeader = tokenHeaderName ? login.headers.get(tokenHeaderName) ?? login.headers.get(tokenHeaderName.toLowerCase()) : void 0;
    if (tokenHeader) {
      const requestHeaderName = detection.headerName ?? "Authorization";
      authHeaders[requestHeaderName] = tokenHeader.match(/^\s*[A-Za-z][A-Za-z0-9_-]*\s+/) ? tokenHeader : `${detection.headerPrefix ?? (requestHeaderName.toLowerCase() === "authorization" ? "Bearer " : "")}${tokenHeader}`;
    } else if (detection.tokenLocation === "body" && detection.tokenFieldPath) {
      const token = extractTokenFromBody(loginBody, detection.tokenFieldPath);
      if (token) {
        const requestHeaderName = detection.headerName ?? "Authorization";
        authHeaders[requestHeaderName] = `${detection.headerPrefix ?? (requestHeaderName.toLowerCase() === "authorization" ? "Bearer " : "")}${token}`;
      }
    }
    const cookies = extractSetCookies(login.headers).map((cookie) => cookie.split(";")[0]?.trim()).filter(Boolean);
    if (cookies.length > 0) {
      authHeaders.Cookie = cookies.join("; ");
    }
    if (!authHeaders.Authorization && !authHeaders.Cookie && !(detection.headerName && authHeaders[detection.headerName])) {
      return {
        verified: false,
        url,
        unauthStatus: unauth.status,
        loginStatus: login.status,
        evidence: `unauth=${unauth.status}, login=${login.status}, no token/cookie extracted`,
        reason: "login succeeded but no token or cookie could be extracted"
      };
    }
    const auth = await fetch(url, {
      method: requestMethod,
      headers: authHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
    });
    const authBody = await auth.text().catch(() => "");
    const sameForbidden = unauth.status === auth.status && (auth.status === 401 || auth.status === 403) && preview(unauthBody) === preview(authBody);
    const statusVerified = (unauth.status === 401 || unauth.status === 403) && auth.status < 400 && !sameForbidden;
    const bodyVerified = !statusVerified && unauth.status === 200 && auth.status === 200 && unauthBody !== authBody && // Unauthed body should be "empty-like" (empty JSON, empty string, or very short)
    (unauthBody.trim() === "{}" || unauthBody.trim() === "[]" || unauthBody.trim() === "" || unauthBody.trim().length < 10) && // Authed body should have meaningful content
    authBody.trim().length > 10;
    const verified = statusVerified || bodyVerified;
    return {
      verified,
      url,
      unauthStatus: unauth.status,
      loginStatus: login.status,
      authStatus: auth.status,
      evidence: `unauth=${unauth.status} (${preview(unauthBody)}), login=${login.status}, auth=${auth.status} (${preview(authBody)})`,
      reason: verified ? void 0 : unauth.status === 200 && auth.status === 200 ? "authenticated and unauthenticated responses are the same (SPA or no body differentiation)" : "authenticated request did not become an accessible protected response"
    };
  } catch (err) {
    return {
      verified: false,
      url,
      evidence: `verification request failed: ${toErrorMessage(err)}`,
      reason: toErrorMessage(err)
    };
  }
}
function extractTokenFromBody(body, tokenFieldPath) {
  try {
    const parsed = JSON.parse(body);
    const value = tokenFieldPath.split(".").reduce((current, key) => {
      if (current && typeof current === "object" && key in current) {
        return current[key];
      }
      return void 0;
    }, parsed);
    return typeof value === "string" && value.length > 0 ? value : void 0;
  } catch {
    const lastSegment = tokenFieldPath.includes(".") ? tokenFieldPath.split(".").pop() : tokenFieldPath;
    const match2 = body.match(new RegExp(`"${lastSegment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:\\s*"([^"]+)"`));
    return match2?.[1];
  }
}
async function createAuthViaMcp(llm, repoPath, detection, registrationOk, projectId, baseUrl, repeaterId, api, model, preProbeContext, verifiedTestUrl, authHints) {
  _probeCookieJar = {};
  let capturedAuthHeaders;
  const appHealthProbe = async () => {
    try {
      const res = await fetch(baseUrl, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(5e3)
      });
      return { reachable: true, detail: `HTTP ${res.status} on GET ${baseUrl}` };
    } catch (err) {
      return { reachable: false, detail: `${toErrorMessage(err)} on GET ${baseUrl}` };
    }
  };
  const inspectionTools = [
    {
      type: "function",
      function: {
        name: "listAuths",
        description: "List Bright auth objects in the current project. Use to check what auth objects already exist before creating new ones, or to find the ID of an auth object you just created.",
        parameters: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: "(Optional) text search across auth object names"
            },
            limit: {
              type: "number",
              description: "(Optional) maximum results to return (default 25)"
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "getAuth",
        description: "Fetch the full configuration of a single Bright auth object by ID. Use this after listAuths to inspect how an existing auth object is configured.",
        parameters: {
          type: "object",
          properties: {
            authObjectId: {
              type: "string",
              description: "ID of the auth object to fetch"
            }
          },
          required: ["authObjectId"]
        }
      }
    }
  ];
  const inspectionHandler = async (name, args) => {
    try {
      if (name === "listAuths") {
        const list = await listAuthObjects(api, {
          projectId,
          q: args.q,
          limit: args.limit ?? 25
        });
        return JSON.stringify(list, null, 2);
      }
      if (name === "getAuth") {
        const obj = await getAuthObject(api, args.authObjectId);
        return JSON.stringify(obj, null, 2);
      }
      return `Unknown inspection tool: ${name}`;
    } catch (err) {
      return `Error from Bright API: ${toErrorMessage(err)}`;
    }
  };
  const attemptLog = [];
  const customTools = [
    {
      type: "function",
      function: {
        name: "create_auth",
        description: `Create a Bright auth object with all the correct settings pre-configured.
For session/cookie auth: disables redirect following, uses combined status+redirect reauthTrigger, no embedder needed.
For JWT auth: uses status 401/403 reauthTrigger, adds a header embedder from either a response body token field or a response header token.
For API key: creates a static header auth object.
Supports CSRF token extraction: set csrfUrl to add a GET step that fetches the token before login.
For apps where no endpoint returns 401/403 (e.g. SPA apps, Discourse): use reauthStrategy='body' with reauthBodyPattern to detect unauthenticated responses by matching the response body.`,
        parameters: {
          type: "object",
          properties: {
            authStyle: {
              type: "string",
              enum: ["session", "jwt", "api_key"],
              description: "The authentication style: 'session' for cookie/session-based, 'jwt' for JSON Web Token, 'api_key' for static API key header"
            },
            loginUrl: {
              type: "string",
              description: "Full URL for the login endpoint (e.g. http://localhost:3000/session)"
            },
            loginBody: {
              type: "string",
              description: `Login request body. For form: 'login=user&password=pass'. For JSON: '{"login":"user","password":"pass"}'`
            },
            loginContentType: {
              type: "string",
              enum: ["form", "json"],
              description: "Content type of the login body: 'form' for application/x-www-form-urlencoded, 'json' for application/json"
            },
            testUrl: {
              type: "string",
              description: "Full URL to a protected endpoint. Best: returns 401/403 without auth. If no endpoint returns 401/403, pick one that returns DIFFERENT content when authenticated (e.g. a .json endpoint with 'current_user' field). Prefer .json API endpoints over HTML/SPA routes."
            },
            csrfUrl: {
              type: "string",
              description: "(Session auth) URL that returns a CSRF token in a **JSON endpoint** or **Rails meta tag**. The token is extracted via regex and sent as an HTTP header (X-CSRF-Token) on the login request. E.g. http://localhost:3000/session/csrf. \u26A0\uFE0F IMPORTANT: This only works when CSRF is delivered via JSON or Rails meta tag and sent as a HEADER. If the app uses HTML form hidden inputs (Django csrfmiddlewaretoken, Laravel _token), you MUST use create_auth_raw instead \u2014 it lets you embed the CSRF token directly in the POST body via NexTemplate."
            },
            cookieUrl: {
              type: "string",
              description: "(Session auth) URL to GET before the CSRF step to establish an initial session cookie. Some apps require a session cookie to exist before the CSRF endpoint returns a valid token. Typically the app's root URL (e.g. http://localhost:3000/). Only needed if the CSRF-then-login flow fails with session/token mismatch errors."
            },
            loginAccept: {
              type: "string",
              description: "Accept header value for the login request. Set to 'application/json' when the login endpoint supports JSON responses \u2014 this prevents the server from trying to render HTML (which may crash on missing dependencies like ImageMagick). Leave unset for apps that only return HTML or when you're unsure. IMPORTANT: if login returns 500 with an HTML error page (Content-Type: text/html), try setting this to 'application/json'."
            },
            csrfHeaderName: {
              type: "string",
              description: "(Session auth) HTTP header name to send the CSRF token in. Default: 'X-CSRF-Token'. Some frameworks use 'X-XSRF-Token' or 'csrf-token'."
            },
            csrfExtractPattern: {
              type: "string",
              description: `(Session auth) Regex pattern to extract the CSRF token from the csrfUrl response body. Must have exactly one capture group for the token value. Default: '"csrf"\\s*:\\s*"([^"]*)"' which matches JSON like {"csrf":"token"}. If the CSRF endpoint returns a different format, probe it first and set a matching pattern. Examples: '"token"\\s*:\\s*"([^"]*)"' for {"token":"..."}, 'content="([^"]*)"' for HTML meta tag.`
            },
            reauthStrategy: {
              type: "string",
              enum: ["status", "redirect", "both", "body"],
              description: "How to detect expired auth. 'status' = 401/403 codes (APIs), 'redirect' = Location header containing 'login' (server-rendered), 'both' = status OR redirect (default for session), 'body' = match a regex pattern in the response body (for apps that always return 200). When 'body', set reauthBodyPattern. Use probe_url to check what the app returns without auth to decide."
            },
            reauthBodyPattern: {
              type: "string",
              description: `(When reauthStrategy='body') A regex pattern that matches the UNAUTHENTICATED response body. When the test URL's body matches this, Bright re-authenticates. E.g. 'login_required|current_user.*null' or '"is_admin"\\s*:\\s*false'. First probe the testUrl WITHOUT auth to see what the unauthenticated body looks like, then pick a pattern that matches it but NOT the authenticated response.`
            },
            tokenFieldPath: {
              type: "string",
              description: "(JWT only) If tokenLocation='body', dot-path to the token field in the login response body (e.g. 'token', 'data.accessToken'). If tokenLocation='header', the response header name that contains the token (e.g. 'Authorization')."
            },
            tokenLocation: {
              type: "string",
              enum: ["body", "header", "cookie"],
              description: "(JWT only) Where the login response returns the token. Use 'header' when the token is returned in a response header such as Authorization."
            },
            headerName: {
              type: "string",
              description: "(API key or JWT) Header name to send on authenticated requests (e.g. 'Authorization', 'X-API-Key'). For JWT this is usually Authorization."
            },
            headerPrefix: {
              type: "string",
              description: "(JWT only) Prefix to put before the extracted token in the request header, e.g. 'Bearer '. Use an empty string if the app expects the raw token."
            },
            headerValue: {
              type: "string",
              description: "(API key only) Header value (e.g. 'Bearer sk-xxx', 'my-api-key-123')"
            }
          },
          required: [
            "authStyle",
            "loginUrl",
            "loginBody",
            "loginContentType",
            "testUrl"
          ],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_auth_raw",
        description: `Create a Bright auth object with FULL control over the multistep configuration.
Use this when the simplified create_auth tool cannot express the auth flow. REQUIRED for:
1. **HTML form CSRF** (Django, Laravel, etc.) \u2014 the CSRF token is a hidden input in the form and must go in the POST body, not a header.
2. **OAuth2 PKCE / authorization code** \u2014 multi-step flows with token exchange.
3. **Any flow where create_auth keeps failing** \u2014 gives you full control.

You define the exact steps array, embedders, reauthTriggers, and test request. Steps execute in order. Each step can reference previous step responses via NexTemplate expressions:
- Extract from response body: {{ auth_object.stages.<step_name>.response.body | match:/<regex_with_capture_group>/ }}
- Extract from response header using the documented Bright syntax: {{ auth_object.stages.<step_name>.response.headers | get: '/Location' | match:/code=([^&]+)/ }}
- JWT returned in Authorization header: {{ auth_object.stages.login.response.headers | get: '/Authorization' | match:/(?:Bearers+)?([^s,;]+)/ }}

Example \u2014 Django CSRF (csrfmiddlewaretoken in form body):
  steps: [
    { name: "get_csrf", request: { method: "GET", url: "http://localhost:8080/login", protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
    { name: "login", request: { method: "POST", url: "http://localhost:8080/login", protocol: "http", headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }], body: "csrfmiddlewaretoken={{ auth_object.stages.get_csrf.response.body | match:/csrfmiddlewaretoken\\"\\s+value=\\"([^\\"]+)\\"/ }}&username=bright_test&password=BrightTest123%21", followRedirects: false, maxRedirects: 0 }, successResponseDetection: [{ type: "status", statuses: [200, 302] }] }
  ]
  reauthTriggers: [{ type: "TRIGGER", location: "status", statuses: [401, 403] }, { type: "OR" }, { type: "TRIGGER", location: "header", name: "Location", patterns: ["login"] }]
  Key: CSRF token goes IN the body via NexTemplate. URL-encode special chars in password (! \u2192 %21).

Example \u2014 OAuth2 PKCE flow:
  steps: [
    { name: "login", request: { method: "POST", url: "http://localhost/login", body: '{"username":"...","password":"..."}', headers: [{ name: "Content-Type", value: "application/json" }], protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] },
    { name: "authorize", request: { method: "GET", url: "http://localhost/authorize?client_id=my-app&response_type=code&code_challenge=...&code_challenge_method=S256&redirect_uri=http://localhost/callback&scope=offline_access", protocol: "http", followRedirects: false }, successResponseDetection: [{ type: "status", statuses: [302] }] },
    { name: "token", request: { method: "POST", url: "http://localhost/token", body: "grant_type=authorization_code&code={{ auth_object.stages.authorize.response.headers | get: '/Location' | match:/code=([^&]+)/ }}&code_verifier=...&redirect_uri=http://localhost/callback&client_id=my-app", headers: [{ name: "Content-Type", value: "application/x-www-form-urlencoded" }], protocol: "http" }, successResponseDetection: [{ type: "status", statuses: [200] }] }
  ]
  embedders: [{ type: "header", name: "Authorization", template: "Bearer {{ auth_object.stages.token.response.body | match:/"access_token"\\s*:\\s*"([^"]*)"/ }}", mergeStrategy: "replace" }]`,
        parameters: {
          type: "object",
          properties: {
            steps: {
              type: "string",
              description: `JSON array of multistep login steps. Each step: { name: string, request: { method, url, protocol: "http", headers?: [{name, value}], body?: string, bodyType?: "clear_text", followRedirects?: boolean, maxRedirects?: number, changeMethodOnRedirect?: boolean }, successResponseDetection?: [{type: "status", statuses: [200]}] }. Steps execute in order. Use NexTemplate to reference prior step responses.`
            },
            embedders: {
              type: "string",
              description: `JSON array of embedders that inject tokens into scan requests. Body-token example: { type: "header", name: "Authorization", template: "Bearer {{ auth_object.stages.<step_name>.response.body | match:/<regex>/ }}", mergeStrategy: "replace" }. Header-token example using Bright's documented string interpolation syntax: { type: "header", name: "Authorization", template: "Bearer {{ auth_object.stages.login.response.headers | get: '/Authorization' | match:/(?:Bearer\\\\s+)?([^\\\\s,;]+)/ }}", mergeStrategy: "replace" }. For cookie/session auth (no explicit token), omit or pass empty array \u2014 Bright auto-replays cookies.`
            },
            testUrl: {
              type: "string",
              description: "Full URL to a protected endpoint for session validation. Should return different responses for authenticated vs unauthenticated requests."
            },
            testMethod: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE"],
              description: "HTTP method for the test request. Default: GET"
            },
            testFollowRedirects: {
              type: "boolean",
              description: "Whether the test request should follow HTTP redirects. Default: false. Set to TRUE when your reauthTriggers use body/dom patterns AND the app redirects unauthenticated requests (302 \u2192 login page) \u2014 without this the test sees only the raw 302 body which won't match. Keep FALSE when reauthTriggers check status codes or Location headers \u2014 following would hide the 302 you're trying to detect."
            },
            testMaxRedirects: {
              type: "number",
              description: "Maximum redirects the test request will follow. Only relevant when testFollowRedirects is true. Default: 5."
            },
            reauthTriggers: {
              type: "string",
              description: `JSON array of reauth triggers. Default: [{"type":"TRIGGER","location":"status","statuses":[401,403]}]. For redirect-based: [{"type":"TRIGGER","location":"header","name":"Location","patterns":["login"]}]. Can combine with OR: [..., {"type":"OR"}, ...].`
            },
            successResponseDetection: {
              type: "string",
              description: `JSON array of success detection rules for the overall auth object (applied to the login response). Default: [{"type":"status","statuses":[200]}].`
            }
          },
          required: ["steps", "testUrl"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "test_auth_object",
        description: "Test a Bright auth object. Runs the full login flow and returns detailed stage-by-stage results including HTTP status codes, response body previews, Set-Cookie headers, and request details for each stage (validation, authentication, authorization). Use the response body previews to diagnose issues \u2014 e.g. if the login response contains HTML error pages instead of JSON, the application may need configuration fixes.",
        parameters: {
          type: "object",
          properties: {
            authObjectId: {
              type: "string",
              description: "The auth object ID to test"
            }
          },
          required: ["authObjectId"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "delete_auth_object",
        description: "Delete a Bright auth object that failed testing so you can recreate it with different settings.",
        parameters: {
          type: "object",
          properties: {
            authObjectId: {
              type: "string",
              description: "The auth object ID to delete"
            }
          },
          required: ["authObjectId"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "probe_url",
        description: "Make an HTTP request to the running application and return the actual response (status, headers, body preview). Cookies from set-cookie responses are automatically stored and sent on subsequent requests (browser-like). Use this BEFORE creating an auth object to: (1) find the right test URL by checking which endpoints return 401/403 without auth, (2) check if CSRF tokens are needed (look for csrf meta tags or /session/csrf endpoint), (3) verify login endpoint exists (non-404 response). For full login testing, use create_auth + test_auth_object instead.",
        parameters: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Full URL to probe (e.g. http://localhost:3000/admin/plugins.json)"
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "PUT", "DELETE"],
              description: "HTTP method. Default: GET"
            },
            headers: {
              type: "string",
              description: `JSON object of headers to send, e.g. '{"Content-Type":"application/json","X-CSRF-Token":"abc"}'`
            },
            body: {
              type: "string",
              description: "Request body for POST/PUT"
            }
          },
          required: ["url"],
          additionalProperties: false
        }
      }
    },
    runCommandOnHostTool,
    runCommandInDockerTool,
    saveHintTool,
    removeHintTool,
    getHintsTool,
    {
      type: "function",
      function: {
        name: "create_auth_oidc",
        description: `Create a Bright OIDC/OAuth2 auth object. Supports two grant types:
- "client_credentials": Machine-to-machine, no user needed \u2014 just client ID + secret.
- "password": Resource Owner Password Credentials \u2014 needs client ID + secret AND username + password. Use when the API authenticates real users via a token endpoint (not session cookies).
The Bright platform handles the full token exchange and automatic refresh.`,
        parameters: {
          type: "object",
          properties: {
            tokenEndpoint: {
              type: "string",
              description: "Full URL of the OAuth2 token endpoint (e.g. http://localhost:5555/oauth/token)"
            },
            clientId: {
              type: "string",
              description: "OAuth2 client ID"
            },
            clientSecret: {
              type: "string",
              description: "OAuth2 client secret"
            },
            testUrl: {
              type: "string",
              description: "Full URL to a protected endpoint that requires a valid Bearer token. Should return 401 without token, 200 with valid token."
            },
            scope: {
              type: "string",
              description: '(Optional) Space-separated OAuth2 scopes (e.g. "read write admin")'
            },
            audience: {
              type: "string",
              description: "(Optional) OAuth2 audience parameter"
            },
            resource: {
              type: "string",
              description: "(Optional) OAuth2 resource parameter"
            },
            grantType: {
              type: "string",
              enum: ["client_credentials", "password"],
              description: "OAuth2 grant type. Default: client_credentials. Use 'password' when the API requires user credentials (username+password) exchanged via the token endpoint."
            },
            username: {
              type: "string",
              description: "(Required for grantType='password') The resource owner's username"
            },
            password: {
              type: "string",
              description: "(Required for grantType='password') The resource owner's password"
            }
          },
          required: ["tokenEndpoint", "clientId", "clientSecret", "testUrl"],
          additionalProperties: false
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_auth_header",
        description: `Create a Bright "header" auth object \u2014 static headers attached to every scan request. No login flow, no token exchange. Use this for:
- API key auth with custom headers (e.g. x-api-key, x-client-id + x-client-secret)
- Bearer tokens that are pre-generated / long-lived (not obtained via OAuth token endpoint)
- Any auth where you just need to send fixed header(s) on every request.
Supports multiple headers (e.g. both x-cal-client-id AND x-cal-secret-key).`,
        parameters: {
          type: "object",
          properties: {
            headers: {
              type: "string",
              description: `JSON array of headers to attach. Each element: {"name":"Header-Name","value":"header-value"}. Example: '[{"name":"x-cal-client-id","value":"my-client-id"},{"name":"x-cal-secret-key","value":"my-secret"}]'`
            },
            testUrl: {
              type: "string",
              description: "Full URL to a protected endpoint. Should return 401/403 without the headers, 200 with them."
            },
            testMethod: {
              type: "string",
              enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
              description: "HTTP method for the test request. Default: GET."
            }
          },
          required: ["headers", "testUrl"],
          additionalProperties: false
        }
      }
    }
  ];
  let lastCreateArgs = {};
  const hintStore = HintStore.fromLegacyArray(authHints ?? []);
  const authDefaultStage = "auth";
  const customHandler = async (name, args) => {
    if (name === "create_auth") {
      lastCreateArgs = { ...args };
      const result = await createAuthViaRestApi(
        api,
        projectId,
        repeaterId,
        {
          authStyle: String(args.authStyle),
          loginUrl: String(args.loginUrl),
          loginBody: String(args.loginBody),
          loginContentType: String(args.loginContentType),
          testUrl: normalizeAuthTestUrl(String(args.testUrl), baseUrl, detection, verifiedTestUrl),
          csrfUrl: args.csrfUrl ? String(args.csrfUrl) : void 0,
          csrfHeaderName: args.csrfHeaderName ? String(args.csrfHeaderName) : void 0,
          csrfExtractPattern: args.csrfExtractPattern ? String(args.csrfExtractPattern) : void 0,
          cookieUrl: args.cookieUrl ? String(args.cookieUrl) : void 0,
          loginAccept: args.loginAccept ? String(args.loginAccept) : void 0,
          reauthStrategy: args.reauthStrategy ? String(args.reauthStrategy) : void 0,
          reauthBodyPattern: args.reauthBodyPattern ? String(args.reauthBodyPattern) : void 0,
          tokenLocation: args.tokenLocation ? String(args.tokenLocation) : detection.tokenLocation,
          tokenFieldPath: args.tokenFieldPath ? String(args.tokenFieldPath) : detection.tokenLocation === "header" ? detection.tokenFieldPath ?? detection.headerName ?? "Authorization" : detection.tokenFieldPath ?? void 0,
          headerName: args.headerName ? String(args.headerName) : detection.headerName ?? void 0,
          headerPrefix: args.headerPrefix ? String(args.headerPrefix) : detection.headerPrefix ?? void 0,
          headerValue: args.headerValue ? String(args.headerValue) : void 0
        }
      );
      if (result.error) {
        attemptLog.push(`- create_auth(loginUrl=${args.loginUrl}, testUrl=${args.testUrl}, authStyle=${args.authStyle}, reauthStrategy=${args.reauthStrategy ?? "default"}) \u2192 ERROR: ${result.error}`);
        addAuthHint(authHints, `[auth-create-error] create_auth failed for authStyle=${args.authStyle}, testUrl=${args.testUrl}: ${result.error}`);
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "create_auth_raw") {
      lastCreateArgs = { ...args, authStyle: "raw" };
      let steps;
      try {
        steps = JSON.parse(String(args.steps));
        if (!Array.isArray(steps) || steps.length === 0) {
          return JSON.stringify({ error: "steps must be a non-empty JSON array" });
        }
      } catch (e) {
        return JSON.stringify({ error: `Invalid steps JSON: ${e}` });
      }
      let embedders = [];
      if (args.embedders) {
        try {
          embedders = JSON.parse(String(args.embedders));
          if (!Array.isArray(embedders)) {
            return JSON.stringify({ error: "embedders must be a JSON array" });
          }
        } catch (e) {
          return JSON.stringify({ error: `Invalid embedders JSON: ${e}` });
        }
      }
      let reauthTriggers = [
        { type: "TRIGGER", location: "status", statuses: [401, 403] }
      ];
      if (args.reauthTriggers) {
        try {
          reauthTriggers = JSON.parse(String(args.reauthTriggers));
          if (!Array.isArray(reauthTriggers)) {
            return JSON.stringify({ error: "reauthTriggers must be a JSON array" });
          }
        } catch (e) {
          return JSON.stringify({ error: `Invalid reauthTriggers JSON: ${e}` });
        }
      }
      let successDetection = [
        { type: "status", statuses: [200] }
      ];
      if (args.successResponseDetection) {
        try {
          successDetection = JSON.parse(String(args.successResponseDetection));
          if (!Array.isArray(successDetection)) {
            return JSON.stringify({ error: "successResponseDetection must be a JSON array" });
          }
        } catch (e) {
          return JSON.stringify({ error: `Invalid successResponseDetection JSON: ${e}` });
        }
      }
      const testMethod = args.testMethod ? String(args.testMethod) : "GET";
      const testUrl2 = normalizeAuthTestUrl(String(args.testUrl), baseUrl, detection, verifiedTestUrl);
      const testFollowRedirects = args.testFollowRedirects !== void 0 ? Boolean(args.testFollowRedirects) : false;
      const testMaxRedirects = args.testMaxRedirects !== void 0 ? Number(args.testMaxRedirects) : testFollowRedirects ? 5 : 0;
      for (const step of steps) {
        const req = step.request;
        if (req) {
          if (!req.protocol) req.protocol = "http";
          if (!req.bodyType) req.bodyType = "clear_text";
        }
      }
      const body = {
        name: "Engine Auth \u2014 raw multistep",
        projectId,
        type: "multistep",
        test: {
          repeaterId,
          request: {
            method: testMethod,
            url: testUrl2,
            protocol: "http",
            bodyType: "clear_text",
            followRedirects: testFollowRedirects,
            maxRedirects: testMaxRedirects,
            changeMethodOnRedirect: false
          }
        },
        successResponseDetection: successDetection,
        reauthTriggers,
        config: {
          multistep: {
            steps,
            ...embedders.length > 0 ? { embedders } : {}
          }
        }
      };
      const stepNames = steps.map((s) => {
        const req = s.request;
        return `${s.name}(${req?.method ?? "?"} ${req?.url ?? "?"})`;
      }).join(" \u2192 ");
      console.log(`[Auth] Creating raw multistep auth \u2014 steps: ${stepNames}, test: ${testMethod} ${testUrl2}`);
      const result = await postAuthObject(api, body);
      if (result.error) {
        attemptLog.push(`- create_auth_raw(steps=[${stepNames}], testUrl=${testUrl2}) \u2192 ERROR: ${result.error}`);
        addAuthHint(authHints, `[auth-create-error] create_auth_raw failed for steps=[${stepNames}], testUrl=${testUrl2}: ${result.error}`);
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "create_auth_oidc") {
      lastCreateArgs = { ...args, authStyle: "oidc" };
      const tokenEndpoint = String(args.tokenEndpoint ?? "");
      const clientId = String(args.clientId ?? "");
      const clientSecret = String(args.clientSecret ?? "");
      const testUrl2 = normalizeAuthTestUrl(String(args.testUrl ?? ""), baseUrl, detection, verifiedTestUrl);
      const scope = args.scope ? String(args.scope).split(/[\s,]+/).filter(Boolean) : [];
      const audience = args.audience ? String(args.audience) : void 0;
      const resource = args.resource ? String(args.resource).split(/[\s,]+/).filter(Boolean) : [];
      const grantType = String(args.grantType ?? "client_credentials");
      const username = args.username ? String(args.username) : void 0;
      const password = args.password ? String(args.password) : void 0;
      const oidcConfig = {
        clientId,
        clientSecret,
        ...scope.length > 0 ? { scope } : {},
        ...resource.length > 0 ? { resource } : {},
        ...audience ? { audience } : {},
        grantType,
        tokenEndpoint
      };
      if (grantType === "password") {
        if (!username || !password) {
          return JSON.stringify({ error: "grantType 'password' requires both username and password parameters" });
        }
        oidcConfig.username = username;
        oidcConfig.password = password;
      }
      const grantLabel = grantType === "password" ? "OIDC password" : "OIDC client_credentials";
      const body = {
        name: `Engine Auth \u2014 ${grantLabel}`,
        projectId,
        type: "oidc",
        test: {
          repeaterId,
          request: {
            method: "GET",
            url: testUrl2,
            protocol: "http",
            bodyType: "clear_text",
            followRedirects: false,
            maxRedirects: 0,
            changeMethodOnRedirect: false
          }
        },
        reauthTriggers: [
          { type: "TRIGGER", location: "status", statuses: [401] }
        ],
        successResponseDetection: [
          { type: "status", statuses: [200, 201, 204] }
        ],
        config: {
          oidc: oidcConfig
        }
      };
      console.log(`[Auth] Creating ${grantLabel} auth \u2014 tokenEndpoint: ${tokenEndpoint}, clientId: ${clientId}, test: ${testUrl2}`);
      const result = await postAuthObject(api, body);
      if (result.error) {
        attemptLog.push(`- create_auth_oidc(grantType=${grantType}, tokenEndpoint=${tokenEndpoint}, clientId=${clientId}, testUrl=${testUrl2}) \u2192 ERROR: ${result.error}`);
        addAuthHint(authHints, `[auth-create-error] create_auth_oidc failed: ${result.error}`);
        return JSON.stringify({ error: result.error });
      }
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "create_auth_header") {
      lastCreateArgs = { ...args, authStyle: "header" };
      let headers;
      try {
        headers = JSON.parse(String(args.headers));
        if (!Array.isArray(headers) || headers.length === 0) {
          return JSON.stringify({ error: "headers must be a non-empty JSON array of {name, value} objects" });
        }
        for (const h of headers) {
          if (!h.name || !h.value) {
            return JSON.stringify({ error: `Each header must have 'name' and 'value'. Got: ${JSON.stringify(h)}` });
          }
        }
      } catch (e) {
        return JSON.stringify({ error: `Failed to parse headers JSON: ${toErrorMessage(e)}` });
      }
      const testUrl2 = normalizeAuthTestUrl(String(args.testUrl ?? ""), baseUrl, detection, verifiedTestUrl);
      const testMethod = String(args.testMethod ?? "GET");
      const body = {
        name: "Engine Auth \u2014 static headers",
        projectId,
        type: "header",
        test: {
          repeaterId,
          request: {
            method: testMethod,
            url: testUrl2,
            protocol: "http",
            bodyType: "clear_text",
            followRedirects: false,
            maxRedirects: 0,
            changeMethodOnRedirect: false
          }
        },
        reauthTriggers: [
          { type: "TRIGGER", location: "status", statuses: [401, 403] }
        ],
        successResponseDetection: [
          { type: "status", statuses: [200, 201, 204] }
        ],
        config: {
          request: {
            headers: headers.map((h) => ({
              name: h.name,
              value: h.value,
              mergeStrategy: "replace",
              type: "clear_text"
            }))
          }
        }
      };
      const headerNames = headers.map((h) => h.name).join(", ");
      console.log(`[Auth] Creating static header auth \u2014 headers: [${headerNames}], test: ${testMethod} ${testUrl2}`);
      const result = await postAuthObject(api, body);
      if (result.error) {
        attemptLog.push(`- create_auth_header(headers=[${headerNames}], testUrl=${testUrl2}) \u2192 ERROR: ${result.error}`);
        addAuthHint(authHints, `[auth-create-error] create_auth_header failed: ${result.error}`);
        return JSON.stringify({ error: result.error });
      }
      capturedAuthHeaders = Object.fromEntries(headers.map((h) => [h.name, h.value]));
      return JSON.stringify({ authObjectId: result.id });
    }
    if (name === "test_auth_object") {
      const result = await testAuthObject(
        api,
        String(args.authObjectId),
        appHealthProbe
      );
      const summary = JSON.stringify(result);
      const configSummary = lastCreateArgs.authStyle === "raw" ? `raw multistep, testUrl=${lastCreateArgs.testUrl}` : lastCreateArgs.authStyle === "header" ? `static headers, testUrl=${lastCreateArgs.testUrl}` : `loginUrl=${lastCreateArgs.loginUrl}, testUrl=${lastCreateArgs.testUrl}, authStyle=${lastCreateArgs.authStyle}, reauthStrategy=${lastCreateArgs.reauthStrategy ?? "default"}, csrfUrl=${lastCreateArgs.csrfUrl ?? "none"}`;
      if (!result.passed) {
        attemptLog.push(`- create_auth(${configSummary}) \u2192 test FAILED: ${result.summary ?? summary.slice(0, 300)}`);
        addAuthHint(authHints, `[auth-test-failure] ${configSummary} failed: ${compactAuthHint(result.summary ?? summary.slice(0, 300), 700)}`);
      }
      return JSON.stringify(result);
    }
    if (name === "delete_auth_object") {
      await deleteAuthObject(
        api,
        String(args.authObjectId)
      );
      return "Deleted successfully";
    }
    if (name === "probe_url") {
      return probeUrl2(args);
    }
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      return execInDocker(repoPath, container, cmd);
    }
    if (name === "save_hint" || name === "remove_hint" || name === "get_hints") {
      const out = handleHintTool(name, args, {
        hints: hintStore,
        defaultStage: authDefaultStage,
        label: "Auth",
        // Mirror writes/removes back into the legacy authHints array so prompt
        // builders that still consume string[] keep working.
        onHint: (_stage, hint) => addAuthHint(authHints, hint, { silent: true }),
        onRemoveHint: (_stage, hint) => removeAuthHint(authHints, hint)
      });
      if (out !== null) return out;
    }
    return `Unknown tool: ${name}`;
  };
  const webHandler = createWebSearchHandler(repoPath);
  const combinedHandler = async (name, args) => {
    if (name === "create_auth" || name === "create_auth_raw" || name === "test_auth_object" || name === "delete_auth_object" || name === "probe_url" || name === "run_command_on_host" || name === "run_command_in_docker" || name === "save_hint" || name === "remove_hint" || name === "get_hints") {
      return customHandler(name, args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return webHandler(name, args);
    }
    if (name === "search_files" || name === "read_file" || name === "list_files") {
      return baseCodeHandler(name, args);
    }
    return inspectionHandler(name, args);
  };
  const baseCodeHandler = createToolHandler(repoPath);
  const allTools = [...codebaseTools, ...inspectionTools, ...customTools, ...webSearchTools];
  const resolvedPath = resolveProtectedEndpointPath(detection) ?? "/";
  const testUrl = verifiedTestUrl ?? `${baseUrl}${resolvedPath}`;
  const messages = configureAuthPrompt(baseUrl, testUrl, detection, registrationOk, preProbeContext, authHints ?? []);
  console.log("[Auth] Starting auth configuration with custom tools...");
  const response = await chatWithTools(
    llm,
    messages,
    allTools,
    combinedHandler,
    model,
    50
  );
  const trimmed = response.trim();
  const infraRepairHint = parseInfraRepairResponse(trimmed);
  if (infraRepairHint) {
    console.log(`[Auth] LLM requested infrastructure repair: ${infraRepairHint.slice(0, 200)}`);
    return { authId: void 0, attemptLog, infraRepairHint };
  }
  const authId = parseAuthResponse(trimmed);
  if (!authId) {
    console.error(`[Auth] LLM could not configure auth (response: ${trimmed.slice(0, 200)})`);
    return { authId: void 0, attemptLog };
  }
  console.log(`[Auth] Verifying auth object ${authId} \u2014 running deterministic test...`);
  const verification = await testAuthObject(api, authId, appHealthProbe);
  if (!verification.passed) {
    console.error(`[Auth] Verification FAILED for ${authId}: ${verification.summary?.slice(0, 300)}`);
    attemptLog.push(`- Auth object ${authId} returned by LLM but deterministic verification failed:
${verification.summary?.slice(0, 600)}`);
    addAuthHint(authHints, `[auth-final-verification-failure] Auth object ${authId} failed deterministic verification: ${compactAuthHint(verification.summary ?? "unknown", 700)}`);
    await deleteAuthObject(api, authId);
    return { authId: void 0, attemptLog };
  }
  console.log(`[Auth] Verification PASSED for ${authId} \u2014 all stages successful`);
  return { authId, attemptLog, directAuthHeaders: capturedAuthHeaders };
}
async function registerUser(baseUrl, detection) {
  if (!detection.registerEndpoint || !detection.registerBody) return false;
  const url = `${baseUrl}${detection.registerEndpoint}`;
  const registerContentType = detection.registerContentType ?? detection.loginContentType;
  const ct = CONTENT_TYPE_MAP[registerContentType] ?? "application/json";
  const body = normalizeBody(
    detection.registerBody,
    registerContentType
  );
  try {
    console.log(
      `[Auth] Registering test user via ${detection.registerMethod ?? "POST"} ${detection.registerEndpoint}`
    );
    console.log(`[Auth] Registration body: ${body.slice(0, 400)}`);
    const res = await fetch(url, {
      method: detection.registerMethod ?? "POST",
      headers: { "Content-Type": ct },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG)
    });
    console.log(`[Auth] Registration response: ${res.status}`);
    if (res.status >= 400) {
      const body2 = await res.text().catch(() => "");
      if (body2) console.log(`[Auth] Registration error: ${body2.slice(0, 300)}`);
    }
    return res.status >= 200 && res.status < 400;
  } catch (err) {
    console.warn(
      `[Auth] Registration call failed (user may already exist): ${err}`
    );
    return false;
  }
}
function updateLoginBodyFromRegisteredUser(detection) {
  if (!detection.registerBody) return;
  const registerContentType = detection.registerContentType ?? detection.loginContentType;
  const registration = parseRequestBody(detection.registerBody, registerContentType);
  if (!registration) return;
  const identifier = firstStringValue(registration, [
    "user",
    "username",
    "email",
    "login",
    "identifier"
  ]);
  const password = firstStringValue(registration, ["password", "pass", "pwd"]);
  if (!identifier || !password) return;
  const existingLogin = parseRequestBody(detection.loginBody ?? "{}", detection.loginContentType) ?? {};
  const identifierKey = firstExistingKey(existingLogin, ["user", "username", "email", "login", "identifier"]) ?? (registration.email ? "email" : "username");
  const passwordKey = firstExistingKey(existingLogin, ["password", "pass", "pwd"]) ?? "password";
  const nextLogin = {
    ...existingLogin,
    [identifierKey]: identifier,
    [passwordKey]: password
  };
  detection.loginBody = serializeRequestBody(nextLogin, detection.loginContentType);
  detection.notes = `${detection.notes}
Registered credentials: ${identifierKey}=${identifier}, ${passwordKey}=${password}. Use these credentials for login sanity checks and Bright auth creation.`;
  console.log(`[Auth] Updated login body to use registered test user (${identifierKey}=${identifier})`);
}
function updateLoginBodyFromSeededUser(detection, credentials) {
  const existingLogin = parseRequestBody(detection.loginBody ?? "{}", detection.loginContentType) ?? {};
  const identifierKey = firstExistingKey(existingLogin, ["user", "username", "email", "login", "identifier"]) ?? (credentials.email ? "email" : "username");
  const passwordKey = firstExistingKey(existingLogin, ["password", "pass", "pwd"]) ?? "password";
  const identifier = identifierKey === "username" ? credentials.username : credentials.email || credentials.username;
  const nextLogin = {
    ...existingLogin,
    [identifierKey]: identifier,
    [passwordKey]: credentials.password
  };
  detection.loginBody = serializeRequestBody(nextLogin, detection.loginContentType);
  detection.notes = `${detection.notes}
Seeded login body updated: ${identifierKey}=${identifier}, ${passwordKey}=${credentials.password}. Preserve any other required login fields from detection.`;
  console.log(`[Auth] Updated login body to use seeded test user (${identifierKey}=${identifier})`);
}
function resolveProtectedEndpointPath(detection) {
  if (!detection.protectedEndpointPath) return null;
  const identity = authIdentityFromDetection(detection);
  return detection.protectedEndpointPath.replace(/:(\w+)|\{(\w+)\}/g, (_match, colonName, braceName) => {
    const name = (colonName ?? braceName ?? "").toLowerCase();
    let value;
    if (name.includes("email") || name.includes("mail")) {
      value = identity.email ?? identity.user ?? identity.username;
    } else if (name.includes("user") || name.includes("login") || name.includes("name")) {
      value = identity.user ?? identity.username ?? identity.email;
    } else if (name === "id" || name.endsWith("id")) {
      value = identity.id;
    }
    return encodeURIComponent(value ?? "1");
  });
}
function normalizeAuthTestUrl(requestedUrl, baseUrl, detection, verifiedTestUrl) {
  if (!verifiedTestUrl || !detection.protectedEndpointPath) {
    return requestedUrl;
  }
  const preferredUrl = new URL(verifiedTestUrl, baseUrl).toString();
  const legacyResolvedPath = detection.protectedEndpointPath.replace(/:(\w+)/g, "1").replace(/\{(\w+)\}/g, "1");
  try {
    const requested = new URL(requestedUrl, baseUrl);
    const legacy = new URL(legacyResolvedPath, baseUrl);
    if (requested.pathname === legacy.pathname || requested.pathname.includes("/:") || requested.pathname.includes("%3A")) {
      console.log(`[Auth] Rewrote unverified auth test URL ${requested.toString()} \u2192 verified URL ${preferredUrl}`);
      return preferredUrl;
    }
  } catch {
    return requestedUrl;
  }
  return requestedUrl;
}
function authIdentityFromDetection(detection) {
  const login = parseRequestBody(detection.loginBody ?? "{}", detection.loginContentType) ?? {};
  const user = firstStringValue(login, ["user", "login", "identifier"]);
  const username = firstStringValue(login, ["username", "name"]);
  const email = firstStringValue(login, ["email"]) ?? [user, username].find((value) => value?.includes("@"));
  const id = firstStringValue(login, ["id", "userId", "user_id"]);
  return { user, username, email, id };
}
function parseRequestBody(body, contentType) {
  if (contentType === "form") {
    const params = new URLSearchParams(body);
    const parsed = {};
    for (const [key, value] of params.entries()) {
      parsed[key] = value;
    }
    return parsed;
  }
  if (contentType === "json") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [
            key,
            typeof value === "string" ? value : String(value)
          ])
        );
      }
    } catch {
      return null;
    }
  }
  return null;
}
function serializeRequestBody(body, contentType) {
  if (contentType === "form") {
    return new URLSearchParams(body).toString();
  }
  return JSON.stringify(body);
}
function firstStringValue(body, keys) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return void 0;
}
function firstExistingKey(body, keys) {
  return keys.find((key) => Object.prototype.hasOwnProperty.call(body, key));
}
async function reRegisterUser(registration) {
  const url = `${registration.baseUrl}${registration.endpoint}`;
  const ct = CONTENT_TYPE_MAP[registration.contentType] ?? "application/json";
  const body = normalizeBody(registration.body, registration.contentType);
  try {
    console.log(
      `[Auth] Re-registering test user via ${registration.method} ${registration.endpoint}`
    );
    const res = await fetch(url, {
      method: registration.method,
      headers: { "Content-Type": ct },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG)
    });
    console.log(`[Auth] Re-registration response: ${res.status}`);
  } catch (err) {
    console.warn(
      `[Auth] Re-registration failed (user may already exist): ${err}`
    );
  }
}
async function replaySeedCommands(repoPath, commands) {
  console.log(`[Auth] Replaying ${commands.length} seed command(s)...`);
  for (const cmd of commands) {
    try {
      if (cmd.type === "docker" && cmd.container) {
        console.log(`[Auth:Replay] docker exec [${cmd.container}]: ${cmd.command.slice(0, 200)}`);
        await execInDocker(repoPath, cmd.container, cmd.command);
      } else {
        console.log(`[Auth:Replay] host: ${cmd.command.slice(0, 200)}`);
        await runShellCommand(repoPath, cmd.command);
      }
    } catch (err) {
      console.warn(`[Auth:Replay] Command failed (may be OK if user exists): ${err}`);
    }
  }
}
async function seedTestUser(llm, repoPath, baseUrl, detection, model, activationHint) {
  console.log("[Auth] Starting seed user sub-phase...");
  const capturedCommands = [];
  const seedTools = [
    ...codebaseTools,
    ...webSearchTools,
    runCommandOnHostTool,
    runCommandInDockerTool,
    probeUrlTool
  ];
  const baseCodeHandler = createToolHandler(repoPath);
  const seedWebHandler = createWebSearchHandler(repoPath);
  const handler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Seed] run_command_on_host: ${cmd.slice(0, 200)}`);
      capturedCommands.push({ type: "host", command: cmd });
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Seed] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      capturedCommands.push({ type: "docker", command: cmd, container });
      return execInDocker(repoPath, container, cmd);
    }
    if (name === "probe_url") {
      return probeUrl2(args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return seedWebHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };
  const messages = seedUserPrompt(baseUrl, detection);
  if (activationHint) {
    messages.push({ role: "user", content: activationHint });
  }
  const response = await chatWithTools(llm, messages, seedTools, handler, model, 50);
  try {
    const json = extractJson(response);
    const result = JSON.parse(json);
    if (result.success) {
      console.log(`[Auth:Seed] User created: ${result.username} / ${result.email}`);
      if (capturedCommands.length > 0) {
        result.seedCommands = capturedCommands;
        console.log(`[Auth:Seed] Captured ${capturedCommands.length} seed command(s) for replay`);
      }
      return result;
    }
    console.warn(`[Auth:Seed] Failed to create user: ${result.reason ?? "unknown"}`);
    return void 0;
  } catch {
    console.warn(`[Auth:Seed] Could not parse seed result: ${response.slice(0, 200)}`);
    return void 0;
  }
}
async function seedOAuthClient(llm, repoPath, baseUrl, detection, model) {
  console.log("[Auth:OAuth] Starting OAuth client seed sub-phase...");
  const capturedCommands = [];
  const seedTools = [
    ...codebaseTools,
    ...webSearchTools,
    runCommandOnHostTool,
    runCommandInDockerTool,
    probeUrlTool
  ];
  const baseCodeHandler = createToolHandler(repoPath);
  const seedWebHandler = createWebSearchHandler(repoPath);
  const handler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth:OAuth] run_command_on_host: ${cmd.slice(0, 200)}`);
      capturedCommands.push({ type: "host", command: cmd });
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth:OAuth] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      capturedCommands.push({ type: "docker", command: cmd, container });
      return execInDocker(repoPath, container, cmd);
    }
    if (name === "probe_url") {
      return probeUrl2(args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return seedWebHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };
  const tokenEndpointHint = detection.oauthTokenEndpoint ? `Detected token endpoint: ${detection.oauthTokenEndpoint}` : "Token endpoint not yet identified \u2014 find it in the codebase.";
  const messages = [
    {
      role: "system",
      content: `You are creating an OAuth2 client (client_id + client_secret) in the running application so that Bright DAST can authenticate against the API using client_credentials grant.

## Application context
- Base URL: ${baseUrl}
- ${tokenEndpointHint}
- Framework clues: This appears to be an OAuth2/OIDC API service.

## Your mission
1. **Find the OAuth client table/model** \u2014 search for: OAuthClient, oauth_clients, PlatformOAuthClient, platform_oauth_clients, clients table, Prisma schema, TypeORM entities, etc.
2. **Identify required fields** \u2014 typically: id/clientId, secret/clientSecret, name, permissions/scopes, redirectUri (may be optional for client_credentials).
3. **Create the client** \u2014 use run_command_in_docker (preferred) or run_command_on_host:
   - Direct SQL: INSERT into the clients table (generate UUID for id, use a known secret)
   - Prisma: npx prisma db execute --stdin
   - App CLI: management commands if available
   - Node script: node -e "..." with the app's ORM
4. **Find the token endpoint** \u2014 search routes/controllers for /oauth/token, /token, /auth/token, etc.
5. **Verify** \u2014 use probe_url to POST to the token endpoint with grant_type=client_credentials&client_id=...&client_secret=... and confirm you get a 200 with an access_token.

## Guidelines
- Use a deterministic client_id like "bright-dast-client" or a UUID you generate.
- Use a known client_secret like "bright-dast-secret-001" (this is a local test instance).
- Grant all available scopes/permissions so the DAST scanner can access all endpoints.
- If the app has an existing seed/fixture with OAuth clients, use those credentials instead of creating new ones.
- Check .env, docker-compose, seed files for pre-configured client credentials.

## Response format
Return a JSON object:
{
  "success": true/false,
  "clientId": "the-client-id",
  "clientSecret": "the-client-secret",
  "tokenEndpoint": "/oauth/token" (relative path),
  "reason": "explanation if failed"
}`
    },
    {
      role: "user",
      content: "Create an OAuth2 client for DAST authentication. Search the codebase first, then create the client via database or CLI commands."
    }
  ];
  const response = await chatWithTools(llm, messages, seedTools, handler, model, 50);
  try {
    const json = extractJson(response);
    const result = JSON.parse(json);
    if (result.success) {
      console.log(`[Auth:OAuth] Client created: id=${result.clientId}, endpoint=${result.tokenEndpoint}`);
      if (capturedCommands.length > 0) {
        console.log(`[Auth:OAuth] Captured ${capturedCommands.length} seed command(s) for replay`);
      }
      return result;
    }
    console.warn(`[Auth:OAuth] Failed to create OAuth client: ${result.reason ?? "unknown"}`);
    return void 0;
  } catch {
    console.warn(`[Auth:OAuth] Could not parse OAuth seed result: ${response.slice(0, 200)}`);
    return void 0;
  }
}
async function testAuthObject(api, authObjectId, appHealthProbe) {
  const base = `https://${api.brightHostname}`;
  const url = `${base}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}/test`;
  const headers = {
    Authorization: `Api-Key ${api.brightToken}`,
    Accept: "application/json"
  };
  const maxRetries = 5;
  const retryDelayMs = 5e3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(
      `[Auth] Testing auth object ${authObjectId} (attempt ${attempt}/${maxRetries})`
    );
    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_EXTENDED)
      });
      if (res.status === 503) {
        const body = await res.text().catch(() => "");
        console.warn(`[Auth] Test returned 503: ${body.slice(0, 200)}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, retryDelayMs));
          continue;
        }
        return {
          passed: false,
          summary: `503 after ${maxRetries} retries \u2014 ${body.slice(0, 300)}`
        };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          passed: false,
          summary: `HTTP ${res.status} \u2014 ${body.slice(0, 400)}`
        };
      }
      const BODY_PREVIEW_LIMIT = 800;
      const rawResults = await res.json();
      if (rawResults.length === 0) {
        return { passed: false, summary: "No results returned" };
      }
      const stages = rawResults.map((r) => {
        const detail = {
          stage: r.stage,
          status: r.status
        };
        if (r.name) detail.name = r.name;
        if (r.message) detail.message = r.message;
        if (r.request) {
          detail.request = {
            method: r.request.method ?? "GET",
            url: r.request.url ?? ""
          };
          if (r.request.body) {
            detail.request.body = r.request.body.slice(0, BODY_PREVIEW_LIMIT);
          }
          if (r.request.headers) {
            detail.request.headers = sanitizeHeadersForAuthDiagnostics(r.request.headers);
          }
        }
        if (r.response) {
          const rawBody = r.response.body ?? "";
          const respCt = (() => {
            const hdrs2 = r.response.headers;
            if (!hdrs2) return "";
            const ct = hdrs2["content-type"] ?? hdrs2["Content-Type"];
            return (Array.isArray(ct) ? ct[0] : ct) ?? "";
          })();
          const isHtml = respCt.includes("html") || rawBody.trimStart().startsWith("<");
          const previewText = isHtml ? stripHtmlForAnalysis(rawBody) : rawBody;
          detail.response = {
            status: r.response.status ?? 0,
            bodyPreview: previewText.slice(0, BODY_PREVIEW_LIMIT)
          };
          if (r.status !== "success" && rawBody.length > BODY_PREVIEW_LIMIT) {
            const saved = saveProbeBody(rawBody, respCt || "text/html");
            if (saved) {
              detail.response.bodyFile = saved;
            }
          }
          const hdrs = r.response.headers;
          if (hdrs) {
            detail.response.headers = sanitizeHeadersForAuthDiagnostics(hdrs);
            const ct = hdrs["content-type"] ?? hdrs["Content-Type"];
            if (ct) {
              detail.response.contentType = Array.isArray(ct) ? ct[0] : ct;
            }
            const sc = hdrs["set-cookie"] ?? hdrs["Set-Cookie"];
            if (sc) {
              const cookies = Array.isArray(sc) ? sc : [sc];
              detail.response.setCookie = cookies.map(
                (c3) => c3.length > 120 ? c3.slice(0, 120) + "\u2026" : c3
              );
            }
          }
        }
        return detail;
      });
      const authzAppError = stages.find(
        (s) => s.stage === "authorization" && s.status === "success" && (s.response?.status ?? 0) >= 500
      );
      if (authzAppError) {
        const httpStatus = authzAppError.response?.status ?? 0;
        const bodyPeek = (authzAppError.response?.bodyPreview ?? "").slice(0, 200);
        authzAppError.status = "failure";
        authzAppError.message = `Authorization request returned HTTP ${httpStatus} (application crash, not an auth problem)${bodyPeek ? ` \u2014 body: ${bodyPeek}` : ""}`;
      }
      const lines = stages.map(
        (s) => `${s.name ? `[${s.name}] ` : ""}stage=${s.stage} status=${s.status}${s.message ? ` \u2014 ${s.message}` : ""}${s.response ? ` (HTTP ${s.response.status}, ${s.response.contentType ?? "unknown"}, body=${s.response.bodyPreview.slice(0, 120)}\u2026)` : ""}`
      );
      for (const l of lines) console.log(`[Auth] Test: ${l}`);
      const diagnosticHints = [];
      const authHeaderHint = detectHeaderTokenAuthFailure(stages);
      if (authHeaderHint) {
        diagnosticHints.push(authHeaderHint);
      }
      const testUrlHint = detectBadAuthTestUrl(stages);
      if (testUrlHint) {
        diagnosticHints.push(testUrlHint);
      }
      if (authzAppError) {
        const body = authzAppError.response?.bodyPreview ?? "";
        const httpStatus = authzAppError.response?.status ?? 0;
        const bodyExcerpt = body.length > 300 ? body.slice(0, 300) + "\u2026" : body;
        diagnosticHints.push(
          `DIAGNOSTIC: The "${authzAppError.name ?? "authorization"}" step reached a protected endpoint with valid credentials but the application returned HTTP ${httpStatus}. This is an APPLICATION crash inside the authenticated handler, NOT an auth-configuration problem. Auth is likely already correct \u2014 re-running create_auth with different settings will not help.
ACTION: Read the response body and identify the root cause (commonly a missing environment variable, missing database migration, or missing native dependency), then respond with INFRA_REPAIR including the exact env var name / config value to set in compose.yml or Dockerfile. Response body excerpt: ${bodyExcerpt}`
        );
      }
      for (const s of stages) {
        if (s.status === "success" || !s.response) continue;
        const ct = s.response.contentType ?? "";
        const isHtml = ct.includes("html");
        const httpStatus = s.response.status ?? 0;
        if (s.stage === "authentication" && isHtml) {
          const reqHeaders = s.request;
          const alreadyAskedForJson = JSON.stringify(reqHeaders ?? {}).toLowerCase().includes("application/json");
          if (httpStatus === 500) {
            diagnosticHints.push(
              `DIAGNOSTIC: The "${s.name ?? "login"}" step returned HTTP 500 with Content-Type text/html. This usually means the server tried to render HTML but crashed (e.g. missing system dependency like ImageMagick). TWO actions to consider:
  1. QUICK FIX: Recreate the auth object with loginAccept='application/json' \u2014 this tells the server to return JSON instead of HTML, bypassing the render crash.
  2. ROOT CAUSE: The app has broken HTML rendering. Use run_command_in_docker to check application logs for the actual error. Consider this an infrastructure issue \u2014 report via INFRA_REPAIR.`
            );
          } else if (!alreadyAskedForJson) {
            diagnosticHints.push(
              `DIAGNOSTIC: The "${s.name ?? "login"}" step returned Content-Type text/html (HTTP ${httpStatus}). The login request did NOT include an Accept header requesting JSON. Many web frameworks return HTML login pages by default and only return JSON when the client sends Accept: application/json.
FIX: Recreate the auth object with loginAccept='application/json' (for create_auth) or add a { name: "Accept", value: "application/json" } header to the login step (for create_auth_raw). This is the most common cause of auth failures on server-rendered apps (Rails, Django, Laravel, etc.).`
            );
          } else {
            diagnosticHints.push(
              `DIAGNOSTIC: The "${s.name ?? "login"}" step returned Content-Type text/html (HTTP ${httpStatus}) even though Accept: application/json was sent. The server does not support JSON responses for this endpoint, or the URL is wrong (e.g. returns the login page instead of processing the login). Check that loginUrl points to the API login endpoint, not the HTML login page.`
            );
          }
        }
        if (s.stage === "validation" && isHtml && s.status !== "success") {
          diagnosticHints.push(
            `DIAGNOSTIC: The "${s.name ?? "validation"}" step (CSRF/cookie) returned HTML (HTTP ${httpStatus}). If this is a CSRF token fetch, make sure csrfUrl points to a JSON API endpoint (e.g. /session/csrf.json or /api/csrf) rather than an HTML page. Also try adding Accept: application/json header to the request.`
          );
        }
      }
      const allPassed = stages.every((s) => s.status === "success");
      const fullSummary = diagnosticHints.length > 0 ? lines.join("\n") + "\n\n" + diagnosticHints.join("\n") : lines.join("\n");
      return { passed: allPassed, summary: fullSummary, stages };
    } catch (err) {
      const msg = toErrorMessage(err);
      console.warn(`[Auth] Test error on attempt ${attempt}: ${msg}`);
      const isTimeout = err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError" || /timeout|timed out|aborted/i.test(msg));
      if (isTimeout && appHealthProbe) {
        try {
          const probe = await appHealthProbe();
          if (!probe.reachable) {
            const summary = `[app_unresponsive] Bright auth-test request timed out and the local application is unresponsive (local probe: ${probe.detail}). This is an APPLICATION crash or hang, NOT an auth-configuration problem. Auth retries will keep timing out. ACTION: respond with INFRA_REPAIR \u2014 investigate the application logs (run_command_in_docker on the app container) for the actual error (commonly a missing environment variable like CALENDSO_ENCRYPTION_KEY/JWT_SECRET, a deadlocked request handler, or an unreachable upstream service such as the database/redis), then provide the precise env var or service to set in compose.yml/Dockerfile.`;
            console.warn(
              `[Auth] Local app probe failed (${probe.detail}) \u2014 bailing out of test retries early; INFRA_REPAIR signal sent`
            );
            return {
              passed: false,
              summary,
              stages: [
                {
                  stage: "authorization",
                  status: "failure",
                  message: `app_unresponsive: ${probe.detail}`
                }
              ]
            };
          }
          console.log(
            `[Auth] Local app probe succeeded (${probe.detail}) \u2014 Bright/Repeater may be slow, continuing retry loop`
          );
        } catch (probeErr) {
          console.warn(
            `[Auth] App health probe threw: ${toErrorMessage(probeErr)} \u2014 proceeding with normal retry`
          );
        }
      }
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }
      return { passed: false, summary: `Test failed: ${msg}` };
    }
  }
  return { passed: false, summary: "Exhausted retries" };
}
function sanitizeHeadersForAuthDiagnostics(headers) {
  const sanitized = {};
  for (const [name, rawValue] of Object.entries(headers)) {
    const value = Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
    if (!value) continue;
    sanitized[name] = sanitizeHeaderValueForAuthDiagnostics(name, value);
  }
  return sanitized;
}
function sanitizeHeaderValueForAuthDiagnostics(name, value) {
  const lower = name.toLowerCase();
  if (lower === "authorization") {
    const scheme = value.match(/^\s*([A-Za-z][A-Za-z0-9_-]*)\s+/)?.[1];
    return scheme ? `${scheme} <redacted>` : "<redacted>";
  }
  if (lower === "set-cookie" || lower === "cookie") {
    return value.split(",").map((cookie) => {
      const cookieName = cookie.trim().match(/^([^=;\s]+)/)?.[1] ?? "cookie";
      return `${cookieName}=<redacted>`;
    }).join(", ");
  }
  if (lower.includes("token") || lower.includes("secret") || lower.includes("api-key") || lower.includes("apikey")) {
    return "<redacted>";
  }
  return value.length > 200 ? `${value.slice(0, 200)}...` : value;
}
function detectHeaderTokenAuthFailure(stages) {
  const loginStage = stages.find(
    (s) => s.stage === "authentication" && s.status === "success" && !!s.response?.headers
  );
  const failedAuthorization = stages.find(
    (s) => s.stage === "authorization" && s.status !== "success" && (s.response?.status === 401 || s.response?.status === 403)
  );
  if (!loginStage?.response?.headers || !failedAuthorization) {
    return null;
  }
  const tokenHeaderName = findLikelyTokenResponseHeader(loginStage.response.headers);
  if (!tokenHeaderName) {
    return null;
  }
  const headerRef = normalizeResponseHeaderName(tokenHeaderName);
  return `DIAGNOSTIC: The "${loginStage.name ?? "login"}" step succeeded and returned a token-like response header "${tokenHeaderName}", but authorization still failed with HTTP ${failedAuthorization.response?.status}. The auth object is probably not extracting and embedding that header token.
FIX with create_auth: recreate with authStyle='jwt', tokenLocation='header', tokenFieldPath='${tokenHeaderName}', headerName='Authorization', headerPrefix='Bearer '.
FIX with create_auth_raw: use an embedder like [{ "type": "header", "name": "Authorization", "template": "Bearer {{ auth_object.stages.login.response.headers | get: '/${headerRef}' | match:/(?:Bearer\\\\s+)?([^\\\\s,;]+)/ }}", "mergeStrategy": "replace" }]. Bright's documented string interpolation syntax requires reading response headers with the get pipe (headers | get: '/Header-Name'); do NOT use response.headers.${headerRef}, lowercase dot notation, or bracket syntax. Do NOT use body extractors such as "access_token" unless the login response body actually contains that field.`;
}
function detectBadAuthTestUrl(stages) {
  const loginStage = stages.find((s) => s.stage === "authentication" && s.status === "success");
  const validationStage = stages.find((s) => s.stage === "validation");
  const authorizationStage = stages.find((s) => s.stage === "authorization" && s.status !== "success");
  if (!loginStage || !authorizationStage?.response) return null;
  const authStatus = authorizationStage.response.status;
  const authBody = authorizationStage.response.bodyPreview ?? "";
  const validationBody = validationStage?.response?.bodyPreview ?? "";
  const validationStatus = validationStage?.response?.status;
  const isForbidden = authStatus === 403 || /forbidden/i.test(authBody);
  const sameAsValidation = validationStatus === authStatus && validationBody.slice(0, 120) === authBody.slice(0, 120);
  if (!isForbidden || !sameAsValidation) return null;
  return `DIAGNOSTIC: Login succeeded, but the auth test URL returned the same HTTP ${authStatus} Forbidden response before and after authentication. This usually means the chosen testUrl requires a different user/role or an unresolved route parameter, not that token extraction failed. Pick a protected endpoint that the configured test user can access. If the detected route contains an email placeholder such as /api/users/one/:email/photo, use the registered user's email in the URL, not a numeric placeholder like /api/users/one/1/photo.`;
}
function findLikelyTokenResponseHeader(headers) {
  const preferred = ["authorization", "x-access-token", "x-auth-token", "x-jwt-token"];
  for (const preferredName of preferred) {
    const found = Object.keys(headers).find((name) => name.toLowerCase() === preferredName);
    if (found) return found;
  }
  return Object.keys(headers).find((name) => name.toLowerCase().includes("token")) ?? null;
}
function normalizeBody(body, contentType) {
  if (contentType !== "form") return body;
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      const encoded = new URLSearchParams(obj).toString();
      console.log(
        `[Auth] Converted JSON loginBody to form-encoded: ${encoded.slice(0, 200)}`
      );
      return encoded;
    } catch {
      return body;
    }
  }
  return body;
}
async function deleteAuthObject(api, authObjectId) {
  try {
    const res = await fetch(
      `https://${api.brightHostname}/api/v3/auth-objects/${encodeURIComponent(authObjectId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Api-Key ${api.brightToken}` }
      }
    );
    if (res.ok || res.status === 204) {
      console.log(`[Auth] Deleted failed auth object ${authObjectId}`);
    } else {
      console.warn(`[Auth] Failed to delete auth object: ${res.status}`);
    }
  } catch (err) {
    console.warn(`[Auth] Failed to delete auth object: ${err}`);
  }
}
function parseInfraRepairResponse(trimmed) {
  const match2 = trimmed.match(/INFRA_REPAIR:\s*(.+)/s);
  if (match2?.[1]) {
    return match2[1].trim();
  }
  return void 0;
}
var FALSE_ESCAPE_RE = /no\s*auth|auth.*not\s*required|auth.*skipped|does\s*not\s*require|doesn['']t\s*require|no\s*authentication/i;
function parseAuthResponse(trimmed) {
  if (trimmed === "FAILED" || trimmed.length === 0) {
    return void 0;
  }
  if (FALSE_ESCAPE_RE.test(trimmed)) {
    console.warn(`[Auth] Detected false "no auth" escape from LLM \u2014 treating as FAILED`);
    return void 0;
  }
  const idMatch = trimmed.match(
    /[0-9a-f]{24}|[0-9a-f-]{36}|[A-Za-z0-9_-]{20,24}/i
  );
  return idMatch ? idMatch[0] : void 0;
}
var COMMON_CSRF_KEYS = [
  "csrf",
  "_csrf",
  "csrfToken",
  "csrf_token",
  "authenticity_token",
  "token",
  "X-CSRF-Token",
  "_token"
];
async function autoProbeCsrf(csrfUrl) {
  try {
    console.log(`[Auth] Auto-probing CSRF URL: ${csrfUrl}`);
    const res = await fetch(csrfUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
    });
    const body = await res.text();
    try {
      const json = JSON.parse(body);
      for (const key of COMMON_CSRF_KEYS) {
        if (typeof json[key] === "string" && json[key].length > 10) {
          const pattern = `"${key}"\\s*:\\s*"([^"]+)"`;
          console.log(`[Auth] Auto-detected CSRF pattern: ${pattern} (key="${key}", sample="${json[key].slice(0, 20)}...")`);
          return pattern;
        }
      }
      for (const [topKey, topVal] of Object.entries(json)) {
        if (topVal && typeof topVal === "object") {
          for (const key of COMMON_CSRF_KEYS) {
            if (typeof topVal[key] === "string" && topVal[key].length > 10) {
              const pattern = `"${key}"\\s*:\\s*"([^"]+)"`;
              console.log(`[Auth] Auto-detected CSRF pattern (nested in ${topKey}): ${pattern}`);
              return pattern;
            }
          }
        }
      }
    } catch {
      const metaMatch = body.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
      if (metaMatch) {
        const pattern = `<meta\\s+name=["']csrf-token["']\\s+content=["']([^"']+)["']`;
        console.log(`[Auth] Auto-detected CSRF from HTML meta tag`);
        return pattern;
      }
    }
    console.log(`[Auth] Could not auto-detect CSRF pattern from ${csrfUrl}`);
    return void 0;
  } catch (err) {
    console.warn(`[Auth] CSRF auto-probe failed: ${toErrorMessage(err)}`);
    return void 0;
  }
}
async function preProbeForAuth(baseUrl, detection) {
  const lines = [];
  if (detection.authType === "session" && detection.loginEndpoint) {
    const csrfCandidates = [
      `${baseUrl}/session/csrf`,
      // Discourse
      `${baseUrl}/csrf`
      // generic
    ];
    for (const csrfUrl of csrfCandidates) {
      try {
        const res = await fetch(csrfUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM)
        });
        const body = await res.text();
        if (res.status === 200 && body.length > 0) {
          const preview = body.length > 500 ? body.slice(0, 500) + "..." : body;
          lines.push(`### CSRF probe: GET ${csrfUrl} \u2192 ${res.status}
\`\`\`
${preview}
\`\`\``);
          break;
        }
      } catch {
      }
    }
  }
  if (detection.loginEndpoint) {
    const loginUrl = `${baseUrl}${detection.loginEndpoint}`;
    try {
      const getRes = await fetch(loginUrl, {
        method: "GET",
        headers: { Accept: "text/html, application/json, */*" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM)
      });
      const getBody = await getRes.text();
      const ct = getRes.headers.get("content-type") ?? "";
      const isHtml = ct.includes("html") || getBody.trimStart().startsWith("<");
      const preview = getBody.length > 1e3 ? getBody.slice(0, 1e3) + "..." : getBody;
      const loginType = isHtml ? "HTML page (NOT an API endpoint)" : "API endpoint";
      lines.push(`### Login endpoint probe: GET ${loginUrl} \u2192 ${getRes.status} (${loginType})
Content-Type: ${ct}
\`\`\`
${preview}
\`\`\``);
      if (getRes.status === 405 || getRes.status === 404) {
        lines.push(`
**NOTE**: GET ${loginUrl} returned ${getRes.status} \u2014 the login form is NOT at this URL. Probing root URL for the actual login form...`);
        try {
          const rootRes = await fetch(baseUrl + "/", {
            method: "GET",
            headers: { Accept: "text/html, */*" },
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM)
          });
          const rootBody = await rootRes.text();
          const rootCt = rootRes.headers.get("content-type") ?? "";
          const rootIsHtml = rootCt.includes("html") || rootBody.trimStart().startsWith("<");
          if (rootIsHtml && rootBody.length > 0) {
            const rootPreview = rootBody.length > 1500 ? rootBody.slice(0, 1500) + "..." : rootBody;
            lines.push(`### Login form fallback: GET ${baseUrl}/ \u2192 ${rootRes.status} (login form found at root)
Content-Type: ${rootCt}
\`\`\`
${rootPreview}
\`\`\``);
            const csrfInputMatch = rootBody.match(/<input[^>]+type=["']hidden["'][^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]*value=["']([^"']+)["']/i) || rootBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+type=["']hidden["'][^>]*value=["']([^"']+)["']/i) || rootBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+value=["']([^"']+)["']/i);
            if (csrfInputMatch) {
              lines.push(`
**\u26A0\uFE0F CSRF TOKEN FOUND**: Hidden input field name="${csrfInputMatch[1]}" with a live token value. The login POST **requires** this field in the body. Use \`create_auth_raw\` with NexTemplate extraction.`);
            }
            const formActionMatch = rootBody.match(/<form[^>]+action=["']([^"']+)["']/i);
            if (formActionMatch?.[1]) {
              lines.push(`**Login form action**: ${formActionMatch[1]}`);
            }
          }
        } catch {
        }
      }
      if (isHtml) {
        const csrfInputMatch = getBody.match(/<input[^>]+type=["']hidden["'][^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]*value=["']([^"']+)["']/i) || getBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+type=["']hidden["'][^>]*value=["']([^"']+)["']/i) || getBody.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]+value=["']([^"']+)["']/i);
        if (csrfInputMatch) {
          lines.push(`
**\u26A0\uFE0F CSRF TOKEN FOUND**: Hidden input field name="${csrfInputMatch[1]}" with a live token value. The login POST **requires** this field in the body. Use \`create_auth_raw\` with NexTemplate extraction from GET ${loginUrl}.`);
        }
        const actionMatch = getBody.match(/action=["']([^"']+)["']/i);
        const apiCandidates = /* @__PURE__ */ new Set();
        if (actionMatch?.[1]) {
          const action = actionMatch[1];
          apiCandidates.add(action.startsWith("http") ? action : `${baseUrl}${action}`);
        }
        const path2 = detection.loginEndpoint.replace(/^\//, "");
        for (const candidate of [
          `${baseUrl}/session`,
          `${baseUrl}/api/session`,
          `${baseUrl}/api/auth/login`,
          `${baseUrl}/api/login`,
          `${baseUrl}/auth/sign_in`
        ]) {
          apiCandidates.add(candidate);
        }
        for (const apiUrl of apiCandidates) {
          try {
            const apiRes = await fetch(apiUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", Accept: "application/json" },
              body: "{}",
              redirect: "manual",
              signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM)
            });
            const apiBody = await apiRes.text();
            const apiPreview = apiBody.length > 500 ? apiBody.slice(0, 500) + "..." : apiBody;
            const looksLikeApi = apiRes.status !== 404 && !apiBody.trimStart().startsWith("<");
            if (looksLikeApi) {
              lines.push(`### Candidate API login: POST ${apiUrl} \u2192 ${apiRes.status} (likely real login endpoint)
\`\`\`
${apiPreview}
\`\`\``);
            }
          } catch {
          }
        }
        lines.push(`
**WARNING**: The detected loginEndpoint "${detection.loginEndpoint}" is an HTML page, NOT the API endpoint. Use the real API endpoint found above as loginUrl in create_auth.`);
      }
    } catch {
    }
  }
  const candidateTestUrls = /* @__PURE__ */ new Set();
  if (detection.protectedEndpointPath) {
    const resolved = resolveProtectedEndpointPath(detection) ?? detection.protectedEndpointPath;
    candidateTestUrls.add(`${baseUrl}${resolved}`);
  }
  candidateTestUrls.add(`${baseUrl}/notifications.json`);
  candidateTestUrls.add(`${baseUrl}/session/current.json`);
  for (const url of candidateTestUrls) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM)
      });
      const body = await res.text();
      const preview = body.length > 300 ? body.slice(0, 300) + "..." : body;
      lines.push(`### Test URL probe: GET ${url} \u2192 ${res.status}
\`\`\`
${preview}
\`\`\``);
    } catch {
    }
  }
  if (lines.length === 0) {
    return "";
  }
  console.log(`[Auth] Pre-probed ${lines.length} endpoints for LLM context`);
  return lines.join("\n\n");
}
async function repairBrokenLogin(llm, repoPath, baseUrl, diagnostic, model) {
  console.log("[Auth] Starting login repair sub-phase...");
  const repairTools = [
    ...codebaseTools,
    ...webSearchTools,
    runCommandOnHostTool,
    runCommandInDockerTool,
    editFileTool,
    probeUrlTool
  ];
  const baseCodeHandler = createToolHandler(repoPath);
  const repairWebHandler = createWebSearchHandler(repoPath);
  const handler = async (name, args) => {
    if (name === "run_command_on_host") {
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Repair] run_command_on_host: ${cmd.slice(0, 200)}`);
      return runShellCommand(repoPath, cmd);
    }
    if (name === "run_command_in_docker") {
      const container = String(args.container ?? "");
      const cmd = String(args.command ?? "");
      console.log(`[Auth:Repair] run_command_in_docker [${container}]: ${cmd.slice(0, 200)}`);
      return execInDocker(repoPath, container, cmd, 12e4);
    }
    if (name === "probe_url") {
      return probeUrl2(args);
    }
    if (name === "edit_file") {
      return handleEditFile(repoPath, args);
    }
    if (name === "search_web" || name === "fetch_url") {
      return repairWebHandler(name, args);
    }
    return baseCodeHandler(name, args);
  };
  const messages = repairBrokenLoginPrompt(baseUrl, diagnostic);
  const response = await chatWithTools(llm, messages, repairTools, handler, model, 50);
  try {
    const json = extractJson(response);
    const result = JSON.parse(json);
    if (result.fixed) {
      console.log(`[Auth:Repair] Login fixed: ${result.action ?? "unknown action"}`);
      return { fixed: true };
    }
    console.warn(`[Auth:Repair] Could not fix login: ${result.reason ?? "unknown"}`);
    return {
      fixed: false,
      infraRepairHint: result.rebuildHint ?? result.reason
    };
  } catch {
    console.warn(`[Auth:Repair] Could not parse repair result: ${response.slice(0, 200)}`);
    return {
      fixed: false,
      infraRepairHint: `Login repair could not produce a verified running fix. Use source-level repair and a full Docker rebuild/restart. Last response: ${response.slice(0, 500)}`
    };
  }
}
async function preAuthLoginSanityCheck(baseUrl, detection) {
  if (!detection.loginEndpoint) {
    return { functional: true, diagnostic: "" };
  }
  const loginUrl = `${baseUrl}${detection.loginEndpoint}`;
  const lines = [];
  let csrfToken;
  let sessionCookie;
  let functional = true;
  if (detection.authType === "session") {
    const csrfCandidates = [
      `${baseUrl}/session/csrf`,
      `${baseUrl}/csrf`
    ];
    for (const csrfUrl of csrfCandidates) {
      try {
        const res = await fetch(csrfUrl, {
          method: "GET",
          headers: { Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MEDIUM)
        });
        const body = await res.text();
        if (res.status === 200 && !body.trimStart().startsWith("<")) {
          const csrfMatch = body.match(/"csrf"\s*:\s*"([^"]*)"/);
          if (csrfMatch?.[1]) {
            csrfToken = csrfMatch[1];
          }
          const setCookies = extractSetCookies(res.headers);
          for (const sc of setCookies) {
            const pair = sc.split(";")[0]?.trim();
            if (pair?.includes("=")) {
              sessionCookie = (sessionCookie ? sessionCookie + "; " : "") + pair;
            }
          }
          break;
        } else if (res.status >= 500) {
          lines.push(`\u26A0\uFE0F Optional CSRF probe ${csrfUrl} returned HTTP ${res.status}. Ignoring this unless the actual login endpoint also fails; many apps do not expose generic CSRF routes.`);
        }
      } catch {
      }
    }
  }
  const loginBody = detection.loginBody ?? "{}";
  {
    const headers = {
      "Content-Type": detection.loginContentType === "form" ? "application/x-www-form-urlencoded" : "application/json",
      Accept: "application/json"
    };
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    if (sessionCookie) headers["Cookie"] = sessionCookie;
    try {
      const res = await fetch(loginUrl, {
        method: "POST",
        headers,
        body: loginBody,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
      });
      const body = await res.text();
      const preview = body.length > 300 ? body.slice(0, 300) + "..." : body;
      if (res.status >= 500) {
        functional = false;
        lines.push(
          `\u{1F6A8} **LOGIN ENDPOINT BROKEN**: POST ${loginUrl} \u2192 HTTP ${res.status}
Response: \`${preview}\`
The application's login is crashing with a server error. This is NOT an auth configuration issue \u2014 the app itself is broken. Auth configuration cannot succeed until the app's login works.`
        );
      } else if (res.status === 403 && body.includes("CSRF")) {
        lines.push(
          `### Login sanity check: POST ${loginUrl} \u2192 ${res.status} (CSRF required)
The login endpoint is functional but requires a valid CSRF token. Response: \`${preview}\``
        );
      } else if (res.status === 200 || res.status === 201 || res.status === 302) {
        const hasError = /error|invalid|incorrect|failed/i.test(body);
        if (hasError) {
          lines.push(
            `### Login sanity check: POST ${loginUrl} \u2192 ${res.status} (credentials rejected)
The login endpoint is functional but rejected the credentials. Response: \`${preview}\``
          );
        } else {
          lines.push(
            `### Login sanity check: POST ${loginUrl} \u2192 ${res.status} \u2705 Login works!`
          );
        }
      } else {
        lines.push(
          `### Login sanity check: POST ${loginUrl} \u2192 ${res.status}
Response: \`${preview}\``
        );
      }
    } catch (err) {
      lines.push(
        `### Login sanity check: POST ${loginUrl} \u2192 connection error: ${toErrorMessage(err)}`
      );
    }
  }
  const diagnostic = lines.join("\n\n");
  if (diagnostic) {
    console.log(`[Auth] Login sanity check: ${functional ? "functional" : "BROKEN"}`);
    if (!functional) {
      console.error(`[Auth] Login endpoint is broken \u2014 app may be in an unstable state`);
    }
  }
  return { functional, diagnostic };
}
function isSetupLikeEndpoint(endpoint) {
  return !!endpoint && /(?:^|\/)(?:setup|install|register|registration)(?:\/|$)|authentication\/setup/i.test(endpoint);
}
function deriveLoginCandidatesFromSetupEndpoint(endpoint) {
  if (!endpoint) return [];
  const candidates = /* @__PURE__ */ new Set();
  const trimmed = endpoint.replace(/\/+$/, "");
  for (const suffix of [
    /\/authentication\/setup$/i,
    /\/setup$/i,
    /\/install$/i,
    /\/finish-installation\/register$/i,
    /\/register$/i,
    /\/registration$/i
  ]) {
    if (suffix.test(trimmed)) {
      candidates.add(trimmed.replace(suffix, "/session/"));
      candidates.add(trimmed.replace(suffix, "/login/"));
    }
  }
  return [...candidates];
}
async function discoverLoginEndpoint(baseUrl, nearbyEndpoint) {
  const candidates = [
    ...deriveLoginCandidatesFromSetupEndpoint(nearbyEndpoint),
    "/api/login",
    "/api/auth/login",
    "/login",
    "/auth/sign_in",
    "/api/session",
    "/session",
    "/api/v1/auth/login",
    "/api/v1/session"
  ];
  for (const path2 of candidates) {
    try {
      const res = await fetch(`${baseUrl}${path2}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: "{}",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT)
      });
      if (res.status !== 404) {
        return path2;
      }
    } catch {
    }
  }
  return null;
}
async function verifySeededCredentials(baseUrl, creds, detection) {
  const loginEndpoint = detection.loginEndpoint ?? "/login";
  const loginUrl = `${baseUrl}${loginEndpoint}`;
  let csrfToken;
  let csrfFieldName;
  let sessionCookie;
  const csrfCandidates = [
    `${baseUrl}/csrf`,
    `${baseUrl}/session/csrf`,
    `${baseUrl}/api/csrf`,
    `${baseUrl}/api/auth/csrf`,
    // NextAuth
    `${baseUrl}/sanctum/csrf-cookie`
    // Laravel Sanctum
  ];
  for (const csrfUrl of csrfCandidates) {
    try {
      const res = await fetch(csrfUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT)
      });
      if (res.status === 200) {
        const body = await res.text();
        const csrfMatch = body.match(/"(?:csrf|csrfToken|_csrf|csrf_token)"\s*:\s*"([^"]*)"/);
        if (csrfMatch?.[1]) csrfToken = csrfMatch[1];
        const setCookies = extractSetCookies(res.headers);
        for (const sc of setCookies) {
          const pair = sc.split(";")[0]?.trim();
          if (pair?.includes("=")) {
            sessionCookie = (sessionCookie ? sessionCookie + "; " : "") + pair;
          }
        }
        if (csrfToken) break;
      }
    } catch {
    }
  }
  if (!csrfToken) {
    const formCsrfCandidates = detection.csrfFormUrl ? [`${baseUrl}${detection.csrfFormUrl}`] : [loginUrl, `${baseUrl}/`];
    for (const formUrl of formCsrfCandidates) {
      try {
        const res = await fetch(formUrl, {
          method: "GET",
          headers: { Accept: "text/html, */*" },
          redirect: "follow",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT)
        });
        if (res.status === 200) {
          const body = await res.text();
          const csrfInputMatch = body.match(/<input[^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["'][^>]*value=["']([^"']+)["']/i) || body.match(/<input[^>]+value=["']([^"']+)["'][^>]+name=["'](csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)[^"']*["']/i);
          if (csrfInputMatch) {
            if (csrfInputMatch[2] && /^(csrf|csrfmiddlewaretoken|_token|authenticity_token|_csrf_token|csrfToken)$/i.test(csrfInputMatch[1])) {
              csrfFieldName = csrfInputMatch[1];
              csrfToken = csrfInputMatch[2];
            } else {
              csrfToken = csrfInputMatch[1];
              csrfFieldName = csrfInputMatch[2];
            }
          }
          const setCookies = extractSetCookies(res.headers);
          for (const sc of setCookies) {
            const pair = sc.split(";")[0]?.trim();
            if (pair?.includes("=")) {
              sessionCookie = (sessionCookie ? sessionCookie + "; " : "") + pair;
            }
          }
          if (csrfToken) break;
        }
      } catch {
      }
    }
  }
  const jsonBodies = [
    JSON.stringify({ user: creds.username, password: creds.password }),
    JSON.stringify({ login: creds.username, password: creds.password }),
    JSON.stringify({ username: creds.username, password: creds.password }),
    JSON.stringify({ email: creds.email ?? creds.username, password: creds.password })
  ];
  for (const jsonBody of jsonBodies) {
    try {
      const jsonHeaders = {
        "Content-Type": "application/json",
        Accept: "application/json"
      };
      if (csrfToken && !csrfFieldName) jsonHeaders["X-CSRF-Token"] = csrfToken;
      if (sessionCookie) jsonHeaders["Cookie"] = sessionCookie;
      const res = await fetch(loginUrl, {
        method: "POST",
        headers: jsonHeaders,
        body: jsonBody,
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
      });
      const body = await res.text();
      if (res.status >= 500) continue;
      if (res.status === 200 || res.status === 201 || res.status === 302) {
        const setCookies = extractSetCookies(res.headers);
        const hasSessionCookie = setCookies.some(
          (c3) => /(_t|_session|session_id|token|jwt|Session|grafana_session)/i.test(c3)
        );
        if (hasSessionCookie || (res.status === 200 || res.status === 201) && !/"error|invalid|incorrect|denied"/i.test(body)) {
          return { valid: true, reason: "" };
        }
      }
      if ((res.status === 400 || res.status === 401) && /invalid|incorrect|wrong|bad.*login|unauthorized/i.test(body)) {
        const preview = body.length > 200 ? body.slice(0, 200) + "..." : body;
        return { valid: false, reason: `Login rejected credentials: ${preview}` };
      }
    } catch {
    }
  }
  let formBody = `login=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  if (csrfToken && csrfFieldName) {
    formBody = `${csrfFieldName}=${encodeURIComponent(csrfToken)}&${formBody}`;
  }
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json"
  };
  if (csrfToken && !csrfFieldName) headers["X-CSRF-Token"] = csrfToken;
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  try {
    const res = await fetch(loginUrl, {
      method: "POST",
      headers,
      body: formBody,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_DEFAULT)
    });
    const body = await res.text();
    if (res.status >= 500) {
      return { valid: false, reason: `Login returned HTTP ${res.status} \u2014 app may be broken` };
    }
    const isNotActivated = /not.activated|not.verified|email.confirm|must.confirm|activation.required|verify.your.email/i.test(body);
    if (isNotActivated) {
      const preview = body.length > 200 ? body.slice(0, 200) + "..." : body;
      return { valid: false, reason: `not_activated: ${preview}` };
    }
    if (/\b(error|invalid|incorrect|wrong|failed|denied)\b/i.test(body) && !/"current_user"/.test(body)) {
      const preview = body.length > 200 ? body.slice(0, 200) + "..." : body;
      return { valid: false, reason: `Login rejected credentials: ${preview}` };
    }
    if (res.status === 200 || res.status === 201 || res.status === 302) {
      const setCookies = extractSetCookies(res.headers);
      const hasSessionCookie = setCookies.some(
        (c3) => /(_t|_session|session_id|token|jwt|Session)/i.test(c3)
      );
      if (hasSessionCookie || res.status === 302 || res.status === 201) {
        if (detection.protectedEndpointPath || detection.csrfRequired) {
          const verifyCookie = setCookies.map((c3) => c3.split(";")[0]?.trim()).filter(Boolean).join("; ") || sessionCookie || "";
          const verifyUrl = detection.protectedEndpointPath ? `${baseUrl}${resolveProtectedEndpointPath(detection) ?? detection.protectedEndpointPath}` : `${baseUrl}/`;
          try {
            const verifyRes = await fetch(verifyUrl, {
              method: "GET",
              headers: { Accept: "text/html, application/json, */*", Cookie: verifyCookie },
              redirect: "follow",
              signal: AbortSignal.timeout(FETCH_TIMEOUT_SHORT)
            });
            const verifyBody = await verifyRes.text();
            const stillShowsLogin = /<form[^>]*action=["'][^"']*login/i.test(verifyBody) || /<input[^>]+name=["']password["']/i.test(verifyBody) || /Sign\s*In|Log\s*In/i.test(verifyBody.slice(0, 500));
            if (stillShowsLogin && verifyRes.status === 200) {
              return { valid: false, reason: "Login returned 302 but session was NOT authenticated \u2014 protected resource still shows login form (likely missing CSRF token in login POST)" };
            }
          } catch {
          }
        }
        return { valid: true, reason: "Login succeeded with session cookie" };
      }
      if (/"user"/.test(body) || /"username"/.test(body)) {
        return { valid: true, reason: "Login returned user data" };
      }
    }
    if (res.status >= 400) {
      return { valid: false, reason: `Login returned HTTP ${res.status}` };
    }
    return { valid: true, reason: `Login returned HTTP ${res.status} \u2014 assuming OK` };
  } catch (err) {
    return { valid: false, reason: `Login request failed: ${toErrorMessage(err)}` };
  }
}
var _probeCookieJar = {};
async function probeUrl2(args) {
  const url = String(args.url ?? "");
  const method = String(args.method ?? "GET").toUpperCase();
  let extraHeaders = {};
  if (args.headers) {
    try {
      extraHeaders = JSON.parse(String(args.headers));
    } catch {
      return "Error: invalid JSON in headers parameter";
    }
  }
  const jarCookieStr = Object.entries(_probeCookieJar).map(([k, v]) => `${k}=${v}`).join("; ");
  const fetchOpts = {
    method,
    headers: {
      Accept: "application/json, text/html, */*",
      ...jarCookieStr && !extraHeaders.Cookie && !extraHeaders.cookie ? { Cookie: jarCookieStr } : {},
      ...extraHeaders
    },
    redirect: "manual",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_LONG)
  };
  if (args.body && (method === "POST" || method === "PUT")) {
    fetchOpts.body = String(args.body);
  }
  try {
    console.log(`[Auth] Probing ${method} ${url}`);
    const res = await fetch(url, fetchOpts);
    try {
      const setCookies = extractSetCookies(res.headers);
      for (const sc of setCookies) {
        const pair = sc.split(";")[0]?.trim();
        if (pair) {
          const eqIdx = pair.indexOf("=");
          if (eqIdx > 0) {
            _probeCookieJar[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
          }
        }
      }
    } catch {
    }
    const status = res.status;
    const headerLines = [];
    for (const [k, v] of res.headers.entries()) {
      const lk = k.toLowerCase();
      if (lk === "content-type" || lk === "location" || lk === "set-cookie" || lk === "x-csrf-token" || lk === "www-authenticate" || lk.startsWith("x-discourse")) {
        headerLines.push(`${k}: ${v}`);
      }
    }
    const bodyText = await res.text().catch(() => "");
    const bodyPreview = bodyText.length > 2e3 ? bodyText.slice(0, 2e3) + "\n... [truncated]" : bodyText;
    const parts = [`HTTP ${status}`];
    if (headerLines.length > 0) parts.push(headerLines.join("\n"));
    const contentType = res.headers.get("content-type") ?? "";
    const acceptHeader = fetchOpts.headers?.Accept ?? "";
    if (contentType.includes("text/html") && acceptHeader.includes("application/json") && bodyText.includes("<html")) {
      parts.push(
        "\u26A0\uFE0F NOTE: This endpoint returned HTML content even though JSON was requested. This likely means the app is serving a catch-all page (setup wizard, SPA shell, or error page) rather than an actual API response. This does NOT indicate the endpoint is unprotected."
      );
    }
    parts.push(bodyPreview || "(empty body)");
    const savedPath = saveProbeBody(bodyText, contentType);
    if (savedPath) {
      parts.push(`
\u{1F4C4} Full response body (${bodyText.length} bytes) saved to: ${savedPath}
Use read_file to inspect for errors, setup instructions, or configuration requirements.`);
    }
    console.log(`[Auth] Probe result: ${status}`);
    return parts.join("\n\n");
  } catch (err) {
    const msg = toErrorMessage(err);
    return `Error: ${msg}`;
  }
}

export {
  FETCH_TIMEOUT_QUICK,
  FETCH_TIMEOUT_SHORT,
  FETCH_TIMEOUT_MEDIUM,
  FETCH_TIMEOUT_DEFAULT,
  FETCH_TIMEOUT_LONG,
  extractSetCookies,
  SEVERITY_ORDER,
  findingKey,
  buildSeveritySummary,
  sleep,
  formatTechStack,
  toErrorMessage,
  toDetailedErrorMessage,
  extractJson,
  parseJsonLenient,
  extractCodeBlock,
  stripHtmlForAnalysis,
  injectEnvVarsFromHint,
  listTests,
  verifyBrightAuth,
  glob,
  codebaseTools,
  createToolHandler,
  webSearchTools,
  createWebSearchHandler,
  verifyDockerImageTool,
  dockerfileTools,
  createDockerfileToolHandler,
  fixDockerfileImages,
  HintStore,
  buildToolDefs,
  createUnifiedToolHandler,
  editFileTool,
  infraTools,
  execInDocker,
  handleEditFile,
  createInfraToolHandler,
  detectAndConfigureAuth,
  registerUser,
  reRegisterUser,
  replaySeedCommands,
  testAuthObject
};
//# sourceMappingURL=chunk-PFDCUUHO.js.map