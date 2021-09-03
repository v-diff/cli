const express = require('express')
const app = express()
const port = process.env.PORT || 8000 

app.get('/hello', (req, res) => {
  res.send('Hello Worldd!')
})

app.get('/get/time', (req, res) => {
  res.send(new Date())
})

app.get('/get/user/:name', (req, res) => {
  res.send({"Name":  req.params.name, "Email": req.params.name+"@gmail.com", "PhoneNumber": "18008008000"})
})

app.get("/get/credential/:name", (req, res) => {
  res.send({
    "username" : req.params.name,
    "password" : "new_passw  ord",
    "validation-factors" : {
       "validationFactors" : [
          {
             "name" : "remote_address",
             "value" : "127.0.0.2"
          }
       ]
    }
 })
})

app.get('/get/article', (req, res) => {
  res.send({
    "data": [{
      "type": "articles",
      "id": "1",
      "attributes": {
        "title": "JSON:API paints my bikeshed!",
        "body": "The shortest article. Ever !",
        "created": "2014-05-22T14:56:29.000Z",
        "updated": "2019-05-22T14:56:28.000Z"
      },
      "relationships": {
        "author": {
          "data": {"id": "43", "type": "people"}
        }
      }
    }],
    "included": [
      {
        "type": "people",
        "id": "43",
        "attributes": {
          "name": "James",
          "age": 81,
          "gender": "male"
        }
      }
    ]
  })
})

app.get('/get/articles/metadata', (req, res) => {
  res.send({
    "meta": {
      "totalPages": 14
    },
    "data": [
      {
        "type": "articles",
        "id": "4",
        "attributes": {
          "title": "JSON:API paints my bikeshed blue !",
          "body": "The shortest article. Ever.",
          "created": "2015-06-22T14:56:29.000Z",
          "updated": "2015-06-22T14:56:28.000Z"
        }
      }
    ],
    "links": {
      "self": "http://example.com/articles?page[number]=3&page[size]=2",
      "first": "http://example.com/articles?page[number]=1&page[size]=1",
      "prev": "http://example.com/articles?page[number]=2&page[size]=1",
      "next": "http://example.com/articles?page[number]=4&page[size]=1",
      "last": "http://example.com/articles?page[number]=13&page[size]=1"
    }
  })
})

app.post('/', (req, res) => {
  res.send('Success')
})

app.listen(port, () => {
	console.log(process.env.UIServerHostname)
  console.log(`Example app listening  at http://localhost:${port}`)
})
