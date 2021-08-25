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

def run_custom_build_logic(args):
    args = list(args)
    if not len(args) > 1:
        print("vdiff build, like docker build, requires exactly 1 argument.")
        print("Usage:  vdiff build [OPTIONS] PATH | URL | -")
        return 

    username = ''
    try:
        username = getpass.getuser()
    except:
        username = 'not_found'

    
    print(args)

    #standardize the build context incase files need to be copied
    if args[-1][-1] != "/":
        args[-1] = str(args[-1])+"/"
    print(args[-1])
    
    #check for .dockerignore file
    dockerignore_file_location = args[-1]+".dockerignore"
    dockerignore_exists = os.path.exists(dockerignore_file_location)
    print(dockerignore_exists,dockerignore_file_location)
    
    if dockerignore_exists == True:
        fileObj = open(dockerignore_file_location, "r")
        ignored_files = fileObj.read().splitlines() #puts the file into an array
        fileObj.close()
        print(ignored_files)
        ignored_files = full_ignore_list(args[-1],ignored_files)
        print(ignored_files)

    #make sure dockerfile is copied if outside of directory
    
    dockerfile_index = 0
    if args.__contains__("-f") == True:
        dockerfile_index = args.index("-f")+1
        dockerfile_path = str(args[dockerfile_index])

        if dockerfile_path.startswith("../")==True:
            #naming it dockerfile_vdiff to make it easier to delete
            print(dockerfile_path,dockerfile_index)
            shutil.copy(dockerfile_path, args[-1]+"dockerfile_vdiff")
            args[dockerfile_index] == "dockerfile_vdiff"
    
    print("modifed args:")
    print(args)
    
    tar = tarfile.open("docker_dir.tar.gz", "w:gz")
    tar.add(args[-1], filter=lambda x: None if x.name in ignored_files else x)
    tar.close()
    # #change the build arguement to be the root file since thats all that copied now
    # args[-1] = "."
    # files = {'zipped_docker_dir': open('docker_dir.tar.gz','rb')}
    # values = { 'build_arguments': " ".join(args) }
    # print("----Sending File----")
    # r = requests.post(SERVER_URL, files=files, data=values)
    # print(r.__dict__)
    # print('----File Sent----')
    # path = r.json()['poll_path']
    # print(path)
    # os.remove('docker_dir.tar.gz')
    # #if dockerfile copied then remove
    # if args[dockerfile_index] == "dockerfile_vdiff":
    #     os.remove(args[-1]+"dockerfile_vdiff")
    
    # #Poll for file every 5 seconds
    # print("----Begin Polling----")
    # polling.poll(lambda: requests.get('http://127.0.0.1:5000/poll'+path).status_code == 200, step=5, poll_forever=True)
    # print("----End Polling----")

    # # # Save File
    # r = requests.get('http://127.0.0.1:5000/poll'+path)
    # file_name = ''.join(path[1:]) 
    # f = open(file_name, 'wb')
    # f.write(r.content)
    # f.close()
    
    # # #Docker Load
    # os.system("docker load -i "+ file_name)

def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)


#helper functions
#get full file list
def full_ignore_list(files_location, ignored_files):
    
    out = []
    print("full_ignore_list", ignored_files)
    for i in ignored_files:
        out += glob.glob(files_location+i,recursive=True)
    return out
