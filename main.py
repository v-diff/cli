import click, subprocess, getpass, shutil, requests, os, polling
SERVER_URL = 'http://127.0.0.1:5000/'
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
    username = ''
    try:
        username = getpass.getuser()
    except:
        username = 'not_found'

    args = list(args)
    print(args)
    zipped = shutil.make_archive('docker_dir', 'gztar')
    files = {'zipped_docker_dir': open('docker_dir.tar.gz','rb')}
    values = { 'build_arguments': " ".join(args) }
    print("sending file")
    r = requests.post(SERVER_URL, files=files, data=values)
    print('file sent')
    path = r.json()['poll_path']
    #print(r, path)
    os.remove('docker_dir.tar.gz')
    print("Begin Polling")
    polling.poll(
    lambda: requests.get('http://127.0.0.1:8000'+path).status_code == 200,
    step=60,
    poll_forever=True
    )
    r = requests.get('http://127.0.0.1:8000'+path)
    print("End Polling")
    file_name = ''.join(path[1:]) 
    f = open(file_name, 'wb')
    f.write(r.content)
    f.close()
    os.system("docker load -i "+ file_name)

def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)
