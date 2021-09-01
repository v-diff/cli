import { Diff } from './models';
import { v4 as uuid } from 'uuid';

type HTTP_TYPE = 'REQUEST' | 'RESPONSE';

export const parseDiff = (obj: any): Diff => {
  const req = parseToObject(obj.req, { type: 'REQUEST' });
  const resp = parseToObject(obj.resp, { type: 'RESPONSE' });
  const repl = parseToObject(obj.repl, { type: 'RESPONSE' });

  const conflicts = parseConflicts(resp.body, repl.body)
  const originallyInParity = conflicts.length == 0
	return {
    id: uuid(),
    timestamp: Date.now(),
    originalEndpoint: req.endpoint,
    req,
    resp,
    repl,
    conflicts,
    conflictHash: JSON.stringify(conflicts),
    originallyInParity,
    approvedViaEndpoint: false,
    approvedConflict: false
  };
}

export const getShortForm = (diff: any) => ({
  method: diff.req.method, 
  endpoint: diff.endpoint,
  originalEndpoint: diff.originalEndpoint,
  respStatus: diff.resp.status, 
  respValue: diff.resp.body, 
  replStatus: diff.repl.status,
  replValue: diff.repl.body,
  id: diff.id,
  originallyInParity: diff.originallyInParity,
  approvedConflict: diff.approvedConflict,
  approvedViaEndpoint: diff.approvedViaEndpoint
});

const parseConflicts = function(respBody, replBody): string[] {
  var paths = []
  if (
    respBody &&
    replBody &&
    typeof respBody=="object" &&
    typeof replBody=="object"
  ) {
    var diffs = []
    getObjDiffs(respBody, replBody, "", diffs)
    paths = diffs
  } else {
    const strdiff = getStrDiff(respBody, replBody)
    if (strdiff) {
      paths.push(strdiff)
    }
  }
  paths.sort();
  return paths
}

function getStrDiff(str1, str2){ 
  let diff= '';
  const guardedStr1 = str1 ? String(str1) : '';
  const guardedStr2 = str1 ? String(str2) : '';
  guardedStr2.split('').forEach(function(val, i){
    if (val != guardedStr1.charAt(i))
    diff += val;
  });
  return diff;
}

function getObjDiffs(obj1, obj2, path, paths) {
  path = path === '' ? path : path + ":"
  for(const key in obj1) {
      if(typeof obj2[key] == 'object' && typeof obj1[key] == 'object') 
          arguments.callee(obj1[key], obj2[key], path+key, paths);
          
      if(obj2[key] != obj1[key]) {
        paths.push(path+key)
      }
  }
  return paths
}

type ObjectParseOptions = {
  type: HTTP_TYPE;
}

const parseToObject = function(httpMessage: any, options: ObjectParseOptions) {
  const { type } = options;

  const str = decodeData(httpMessage);
  const jsonObj: any = {};
  let arr = str.split("\r\n\r\n");
  let headers = arr.shift().split("\r\n");
  const route = headers.shift();
  const tmp = route.split(" ");

  if (type === 'REQUEST') {
    jsonObj.method = tmp[0];

    const pathParts = tmp[1].split('?');
    const endpoint = pathParts[0];
    const querystring = pathParts.length > 1 && pathParts[1];
    jsonObj.endpoint = endpoint;
    jsonObj.querystring = querystring;

  } else {
    jsonObj.status = tmp[1];
    jsonObj.statusDescription = tmp[2];
    jsonObj.latency = getLatency(httpMessage);
  }
  const headersJSON = parseHeaders(headers)
  jsonObj.headers = headersJSON

  if (arr.length > 1) {
    arr = [arr.join("\r\n\r\n")]
  }
  const bodyJSON = parseBody(arr.pop(), type, headers)
  jsonObj.body = bodyJSON

	return jsonObj
}

const parseHeaders = function(arr) {
  let headers = {}
  arr.forEach((header) => {
    const tmp =  header.split(": ")
    headers[tmp[0]] = tmp[1]
  });
  return headers
}

const parseBody = function(str, type: HTTP_TYPE, headers) {
  if (type === 'RESPONSE') {
    const result = headers.filter((el) => el.indexOf("Content-Type") != -1)
    if(result.length > 0 && result[0].indexOf("json") != -1 ) {
      return JSON.parse(str)
    }
  }
  return str
}

const decodeData = function(httpMessage) {
  const originalResponseData = Buffer.from(httpMessage.http.data)
  const hexString = originalResponseData.toString('hex')
  const convertHexToUtf8 = str => Buffer.from(str, 'hex').toString('utf8');
  return convertHexToUtf8(hexString)
}

const getLatency = function(data) {
  return data.meta[3]
}
