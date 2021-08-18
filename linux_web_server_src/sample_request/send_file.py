import requests

url = "http://127.0.0.1:5000/"
files = {'zipped_docker_dir': open('docker_dir.tar.gz','rb')}
values = {'build_arguments': '-t test/test -f Dockerfile .'}

print(url, files, values)
r = requests.post(url, files=files, data=values)
print(r)