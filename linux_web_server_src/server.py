from flask import Flask, request
import tarfile
import os
import uuid

app = Flask(__name__)

#saves compressed file locally
def save_file(unique_file_name,zipped_docker_dir):
    file_type = ".tar.gz"
    print('./compressed_files/'+unique_file_name+file_type)
    zipped_docker_dir['zipped_docker_dir'].save('./compressed_files/'+unique_file_name+file_type)

#extracts tar file
def extract_tarfile(unique_file_name):
    file_type = ".tar.gz"
    my_tar = tarfile.open('./compressed_files/'+unique_file_name+file_type)
    my_tar.extractall('./extracted_files/'+unique_file_name)
    my_tar.close()
    os.remove('./compressed_files/'+unique_file_name+file_type)

#builds docker file and saves container to be resent
def docker_build(unique_file_name, build_arguments):
    extract_tarfile(unique_file_name)
    print('./extracted_files/'+unique_file_name)
    os.chdir('./extracted_files/'+unique_file_name)
    print("cd docker_dir ; sudo docker build " + build_arguments)
    os.system("cd docker_dir ; sudo docker build " + build_arguments)
    container_name = os.popen('sudo docker images | awk "{print $1}" | awk "NR==2"').read()
    print(container_name)
    os.remove('./extracted_files/'+unique_file_name)
    os.chdir('../../containers/')
    print("sudo docker save " + container_name.split(' ')[0] + " -o " + unique_file_name)
    os.system("sudo docker save " + container_name.split(' ')[0] + " -o " + unique_file_name)

@app.route('/', methods=['POST'])
def post_file():
    unique_file_name = str(uuid.uuid4())
    build_arguments = request.form
    zipped_docker_dir = request.files
    
    #log values
    print(build_arguments)
    print(zipped_docker_dir)
    
    #save file
    save_file(unique_file_name,zipped_docker_dir)
    ##RUN THIS while the below is a WIP
    #docker_build(unique_file_name,build_arguments['build_arguments'])
    return {
        "poll_path" : "/poll/"+unique_file_name
    }

#WIP
@app.route('/poll/<unique_file_name>', methods=['GET'])
def poll():

    if os.path.isfile('./containers/'+unique_file_name):
        try:
            return send_file('./containers/'unique_file_name, as_attachment=True)
        except Exception as e:
            return self.Error(400)

    else:
        build_arguments = request.form
        docker_build(unique_file_name,build_arguments['build_arguments'])
        try:
            return request.send_file('./containers/'unique_file_name, as_attachment=True)
        except Exception as e:
            self.log.exception(e)
            self.Error(400)

##request.files['file'].save('./')