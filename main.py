import click, subprocess, getpass, shutil, requests, os, polling
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
    for arg in args:
        if flag:
            flag = False 
            continue 
        
        if arg.startswith("-"): 
            flag = True
            continue 

        return arg 

    return

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
    build_context = _get_build_context(args[1:])
    print("Build context is: ", build_context)

    if not build_context:
        print("vdiff build, like docker build, requires exactly 1 argument.")
        print("Usage:  vdiff build [OPTIONS] PATH | URL | -")
    
    # make sure dockerfile is copied if outside of directory
    dockerfile_index = 0
    if "-f" in args:
        dockerfile_index = args.index("-f") + 1
        dockerfile_path = str(args[dockerfile_index])

        if dockerfile_path.startswith("../") == True:
            # naming it dockerfile_vdiff to make it easier to delete
            print(dockerfile_path, dockerfile_index)
            shutil.copy(dockerfile_path, args[-1] + "dockerfile_vdiff")
            args[dockerfile_index] == "dockerfile_vdiff"
    
    
    zipped = shutil.make_archive('docker_dir', 'gztar', root_dir=args[-1])

    # change the build arguement to be the root file since thats all that copied now
    args[-1] = "."
    files = {'zipped_docker_dir': open('docker_dir.tar.gz','rb')}
    values = { 'build_arguments': " ".join(args) }
    
    print("----Sending File----")
    r = requests.post(SERVER_URL, files=files, data=values)
    print('----File Sent----')
    path = r.json()['poll_path']
    print(path)
    os.remove('docker_dir.tar.gz')
    #if dockerfile copied then remove
    if args[dockerfile_index] == "dockerfile_vdiff":
        os.remove(args[-1]+"dockerfile_vdiff")
    
    #Poll for file every 5 seconds
    print("----Begin Polling----")
    polling.poll(lambda: requests.get(SERVER_URL + '/poll' + path).status_code == 200, step=5, poll_forever=True)
    print("----End Polling----")

    # # Save File
    r = requests.get(SERVER_URL + '/poll' + path)
    file_name = ''.join(path[1:]) 
    f = open(file_name, 'wb')
    f.write(r.content)
    f.close()
    
    # Docker Load
    os.system("docker load -i "+ file_name)

def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)
