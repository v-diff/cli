import click, subprocess, getpass, shutil, requests, os, glob, tarfile, time, json
from datetime import datetime


SERVER_URL = 'https://getdaemon.com'
#SERVER_URL = 'http://127.0.0.1:5000'
#SERVER_URL = 'http://faster-docker-build-staging.us-west-2.elasticbeanstalk.com/'

@click.command(context_settings=dict(ignore_unknown_options=True))
@click.argument('cmd', nargs=-1)
def cli(cmd):
    '''
    Use vdiff CLI exactly as you use the Docker CLI.   
    
    vdiff CLI falls back to Docker CLI for every command except for the "build" command, which builds your images 10-100x faster in our cloud.
    '''
    run_custom_build = cmd and cmd[0] == 'build'
    if run_custom_build:
        return run_custom_build_logic(cmd)
    
    return fallback_to_docker(cmd)


def _get_username():
    username = ''
    try:
        username = getpass.getuser()
    except:
        username = 'not_found'
    
    return username

def _is_dockerfile_present(args):
    if "-f" in args:
        index = args.index("-f") + 1
        path = str(args[index])
        return os.path.isfile(path)
    
    return os.path.isfile('Dockerfile')

def _get_build_context(args):
    single_flags = ['--compress','--squash','--rm', '--force-rm',
                     '--disable-content-trust','--no-cache','--stream','--quiet', '-q','--pull']

    flag = False
    for i, arg in enumerate(args):
        if flag:
            if arg.startswith('-'):
                # two flags in a row
                return None, None 

            flag = False 
            continue 
        
        if arg.startswith("-"):
            if arg in single_flags:
                flag = False
            else: 
                flag = True
            continue 

        return i+1, arg

    return None, None 

def _full_ignore_list(files_location, ignored_files):
    out = []
    print("full_ignore_list", ignored_files)
    for i in ignored_files:
        if i:
            out += glob.glob(files_location+i,recursive=True)
    out.append(".dockerignore")
    return out

def _get_dockerignore_files(build_context):
    dockerignore_file_location = build_context + ".dockerignore"
    dockerignore_exists = os.path.exists(dockerignore_file_location)
    ignored_files = [] 

    if dockerignore_exists == True:
        fileObj = open(dockerignore_file_location, "r")
        ignored_files = fileObj.read().splitlines()
        fileObj.close()
        ignored_files = _full_ignore_list(build_context, ignored_files)
    
    return ignored_files

def _add_dockerfile_to_build_context(args, build_context):
    if "-f" in args or "--file" in args:
        if '-f' in args:
            index = args.index("-f") + 1
        else:
            index = args.index("--file") + 1

        print(args)
        path = str(args[index])
        shutil.copy(path, build_context + "dockerfile_vdiff")
        args[index] = "dockerfile_vdiff"
        print("_add_dockerfile end ",args)

def _clear_created_files(build_context, args, path):
    os.remove('docker_dir.tar.gz')
    os.remove(path)
    if "dockerfile_vdiff" in args:
        os.remove(build_context+"dockerfile_vdiff")

def run_custom_build_logic(args):
    print("[TIMER] -- BEGIN VDIFF", datetime.now().strftime("%H:%M:%S"))    
    print("Build arguments are: ", args)
    args = list(args)

    if not len(args) > 1:
        print("vdiff build, like docker build, requires exactly 1 argument.")
        print("Usage:  vdiff build [OPTIONS] PATH | URL | -")
        return 

    if not _is_dockerfile_present(args):
        print("Cannot find dockerfile. Specify path to Dockerfile with '-f' or place Dockerfile in current directory")
        return 

    if '-o' in args or '--output' in args:
        print("vdiff build does not support -o/--output flag.")
        return 

    username = _get_username()
    build_context_index, build_context = _get_build_context(args[1:])
    
    if not build_context:
        print("vdiff build, exactly like docker build, requires exactly 1 argument.")
        print("Usage:  vdiff build [OPTIONS] PATH | URL | -")
        print("Please confirm your vdiff build syntax is correct.")
        return 

    if not build_context[-1] == "/":
        build_context += '/'
    
    print("[TIMER] -- before docker ignore", datetime.now().strftime("%H:%M:%S"))
    ignored_files = _get_dockerignore_files(build_context)
    _add_dockerfile_to_build_context(args, build_context)
    print("[TIMER] -- after docker ignore", datetime.now().strftime("%H:%M:%S"))
    
    print("[TIMER] -- before tar", datetime.now().strftime("%H:%M:%S"))
    tar = tarfile.open("docker_dir.tar.gz", "w:gz")
    tar.add(build_context, filter=lambda x: None if x.name in ignored_files else x, arcname='.')
    tar.close()
    print("[TIMER] -- after tar", datetime.now().strftime("%H:%M:%S"))

    print(build_context, build_context_index, args[build_context_index])
    args[build_context_index] = "."
    files = {'zipped_docker_dir': open('docker_dir.tar.gz','rb')}
    values = { 'build_arguments': " ".join(args[1:]) }

    print("[TIMER] -- BEFORE sending build ctx + dockerfile to server", datetime.now().strftime("%H:%M:%S"))    
    r = requests.post(SERVER_URL, files=files, data=values)
    print("[TIMER] -- AFTER sending build ctx + dockerfile to server", datetime.now().strftime("%H:%M:%S"))    
    print(r.__dict__)
    response_json = r.json()
    path = response_json["poll_path"]
    print("[TIMER] -- BEFORE Polling", datetime.now().strftime("%H:%M:%S"))    
    
    image_sha = None 
    while True:
        time.sleep(5)
        print("Building on our servers...")
        response = requests.get(SERVER_URL + '/poll' + path)
        if response.status_code == 200:
            print("JSON response object is", response.json())
            image_sha = response.json()["image_sha"]
            break
    print("[TIMER] -- AFTER Polling", datetime.now().strftime("%H:%M:%S"))    
    print("Pulling docker image SHA", image_sha)
    print("[TIMER] -- BEFORE Pull", datetime.now().strftime("%H:%M:%S"))
    os.system('docker pull public.ecr.aws/u9v9c4r4/test-registry:%s' % (image_sha))
    print("[TIMER] -- AFTER Pull", datetime.now().strftime("%H:%M:%S"))
    print("[TIMER] -- BEFORE clear_data", datetime.now().strftime("%H:%M:%S"))
    requests.post(SERVER_URL + '/clear_data' + path)
    print("[TIMER] -- AFTER clear_data", datetime.now().strftime("%H:%M:%S"))
    _clear_created_files(build_context, args, path)
    print("[TIMER] -- END VDIFF", datetime.now().strftime("%H:%M:%S"))    

def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)