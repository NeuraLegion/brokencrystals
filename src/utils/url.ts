// Taken from PortSwigger's prototype pollution labs
// VULNERABLE TO PROTOTYPE POLLUTION!
var splitUriIntoParamsPPVulnerable = (params, coerce=undefined) => {
  if (params.charAt(0) === '?') {
    params = params.substring(1);
  }

  var obj = {},
    coerce_types = { true: !0, false: !1, null: null };

  if (!params) {
    return obj;
  }

  params
    .replace(/\+/g, ' ')
    .split('&')
    .forEach(function (v) {
      var param = v.split('='),
        key = decodeURIComponent(param[0]),
        val,
        cur = obj,
        i = 0,
        keys = key.split(']['),
        keys_last = keys.length - 1;

      if (/\[/.test(keys[0]) && /\]$/.test(keys[keys_last])) {
        keys[keys_last] = keys[keys_last].replace(/\]$/, '');
        keys = keys.shift().split('[').concat(keys);
        keys_last = keys.length - 1;
      } else {
        keys_last = 0;
      }

      if (param.length === 2) {
        val = decodeURIComponent(param[1]);

        if (coerce) {
          val =
            val && !isNaN(val) && +val + '' === val
              ? +val // number
              : val === 'undefined'
              ? undefined // undefined
              : coerce_types[val] !== undefined
              ? coerce_types[val] // true, false, null
              : val; // string
        }

        if (keys_last) {
          for (; i <= keys_last; i++) {
            //@ts-ignore
            key = keys[i] === '' ? cur.length : keys[i];
            cur = cur[key] =
              i < keys_last
                ? //@ts-ignore
                  cur[key] || (keys[i + 1] && isNaN(keys[i + 1]) ? {} : [])
                : val;
          }
        } else {
          if (Object.prototype.toString.call(obj[key]) === '[object Array]') {
            obj[key].push(val);
          } else if ({}.hasOwnProperty.call(obj, key)) {
            obj[key] = [obj[key], val];
          } else {
            obj[key] = val;
          }
        }
      } else if (key) {
        obj[key] = coerce ? undefined : '';
      }
    });

  return obj;
};

export default splitUriIntoParamsPPVulnerable;
