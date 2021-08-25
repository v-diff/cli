import click, subprocess, getpass, shutil, requests, os, polling, glob, tarfile
SERVER_URL = 'https://getdaemon.com'

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
    flag = False
    for i, arg in enumerate(args):
        if flag:
            flag = False 
            continue 
        
        if arg.startswith("-"): 
            flag = True
            continue 

        return i, arg

    return None, None 

def _full_ignore_list(files_location, ignored_files):
    out = []
    print("full_ignore_list", ignored_files)
    for i in ignored_files:
        out += glob.glob(files_location+i,recursive=True)
    return out

def _get_dockerignore_files(build_context):
    dockerignore_file_location = build_context + ".dockerignore"
    dockerignore_exists = os.path.exists(dockerignore_file_location)
    ignored_files = [] 

    if dockerignore_exists == True:
        fileObj = open(dockerignore_file_location, "r")
        ignored_files = fileObj.read().splitlines()
        fileObj.close()
        ignored_files = full_ignore_list(build_context, ignored_files)
    
    return ignored_files

def _add_dockerfile_to_build_context(args, build_context):
    if "-f" in args or "--file" in args:
        if '-f' in args:
            index = args.index("-f") + 1
        else:
            index = args.index("--file") + 1

        path = str(args[index])
        shutil.copy(path, build_context + "dockerfile_vdiff")
        args[index] == "dockerfile_vdiff"

def _clear_created_files(build_context, args):
    os.remove('docker_dir.tar.gz')
    if "dockerfile_vdiff" in args:
        os.remove(build_context/"dockerfile_vdiff")

def run_custom_build_logic(args):
    print("Build arguments are: ", args)
    args = list(args)

    if not len(args) > 1:
        print("vdiff build, like docker build, requires exactly 1 argument.")
        print("Usage:  vdiff build [OPTIONS] PATH | URL | -")
        return 

    if not _is_dockerfile_present(args):
        print("Cannot find dockerfile. Specify path to Dockerfile with '-f' or place Dockerfile in current directory")
        return 

    username = _get_username()
    build_context_index, build_context = _get_build_context(args[1:])
    
    if not build_context:
        print("vdiff build, like docker build, requires exactly 1 argument.")
        print("Usage:  vdiff build [OPTIONS] PATH | URL | -")
        return 

    if not build_context[-1] == "/":
        build_context += '/'

    ignored_files = _get_dockerignore_files(build_context)
    _add_dockerfile_to_build_context(args, build_context)
    tar = tarfile.open("docker_dir.tar.gz", "w:gz")
    tar.add(build_context, filter=lambda x: None if x.name in ignored_files else x)
    tar.close()

    args[build_context_index] = "."
    files = {'zipped_docker_dir': open('docker_dir.tar.gz','rb')}
    values = { 'build_arguments': " ".join(args) }
    
    r = requests.post(SERVER_URL, files=files, data=values)
    path = r.json()['poll_path']
    
    _clear_created_files(build_context, args)
    
    print("----Begin Polling----")
    polling.poll(lambda: requests.get(SERVER_URL + '/poll' + path).status_code == 200, step=5, poll_forever=True)
    print("----End Polling----")

    r = requests.get(SERVER_URL + '/poll' + path)
    file_name = ''.join(path[1:]) 
    f = open(file_name, 'wb')
    f.write(r.content)
    f.close()
    
    os.system("docker load -i "+ file_name)

def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)