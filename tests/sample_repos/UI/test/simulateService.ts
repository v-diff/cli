const express = require('express');
const yargs = require('yargs/yargs');
const nodeFetch = require('node-fetch');
const app = express();
const port = 8000;

const argv = yargs(process.argv).argv
const BASE_URL = argv.BASE_URL || 'http://127.0.0.1:3080';
const REPO = argv.REPO || 'test-repo';
const PR = argv.PR || 1;

const args = {
  BASE_URL
}

const getUser = (name: string) => ({
  name,
  email: `${name}@gmail.com`,
  phoneNumber: "18008008000"
});

const getNewUser = (name: string) => ({
  name,
  email: `${name}@vdiff.com`,
  phoneNumber: "18008008000"
});

const getArticles = () => [{
  type: "articles",
  id: "1",
  attributes: {
    title: "JSON:API paints my bikeshed!",
    body: "The shortest article. Ever!",
    created: "2014-05-22T14:56:29.000Z",
    updated: "2019-05-22T14:56:28.000Z"
  },
  relationships: {
    author: {
      data: {
        id: "43",
        type: "people"
      }
    }
  }
}]

const helloWorld = () => 'Hello World'
const randomlyFail = (fn: Function) =>
  () => {
    if (Math.random() < 0.1) {
      throw new Error('failed');
    }

    return fn();
  }



const endpointSpecs = {
  '/hello': {
    main: helloWorld,
    pr: helloWorld
  },
  // '/randomlyFail': {
  //   main: helloWorld,
 //   pr: randomlyFail(helloWorld)
  // },
  '/time': {
    main: () => new Date(),
    pr: () => new Date()
  },
  '/user/Sunny/awef?test=test': {
    main: () => getUser('Sunny'),
    pr: () => getNewUser('Sunny')
  },
  '/user/Varun': {
    main: () => getUser('Varun'),
    pr: () => getNewUser('Varun')
  },
  '/user/Viraj': {
    main: () => getUser('Viraj'),
    pr: () => getNewUser('Viraj')
  },

}

const endpoints = Object.keys(endpointSpecs);

const formatHttpRequest = ({ endpoint }) => `GET ${endpoint} HTTP/1.1\r\nUser-Agent: Mozilla/4.0\r\nHost: localhost\r\n`;

const formatHttpResponse = ({ body }) => `HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nContent-Type: application/json\r\n\r\n${body}`;

const sampleFromList = (list: any[]) => {
  const rand = Math.random();
  const randomIndex = Math.floor(rand * list.length);
  return list[randomIndex];
}

const exec = async () => {
  const resetUrl = `${BASE_URL}/${REPO}/${PR}/reset`;
  await nodeFetch(resetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
  });

  for (let x = 0; x < 1000; x++) {
    const endpoint = sampleFromList(endpoints);
    const endpointSpec = endpointSpecs[endpoint];

    const httpReq = formatHttpRequest({ endpoint });
    const mainHttpResp = formatHttpResponse({
      body: JSON.stringify(endpointSpec.main())
    });
    const prHttpResp = formatHttpResponse({
      body: JSON.stringify(endpointSpec.pr())
    });

    const diff = {
      req: {
        http: {
          data: httpReq
        },
        meta: [1, 2, 3, 4]
      },
      resp: {
        http: {
          data: mainHttpResp
        },
        meta: [1, 2, 3, 4]
      },
      repl: {
        http: {
          data: prHttpResp
        },
        meta: [1, 2, 3, 4]
      }
    };

    const url = `${BASE_URL}/${REPO}/${PR}`;

    try {
      await nodeFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(diff) 
      });
    } catch (e) {
      console.log(e);
    }
  };
}

exec();
