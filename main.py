import click, subprocess, getpass, shutil, requests
SERVER_URL = ''
@click.command()
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
    zipped = shutil.make_archive('docker_dir', 'tar')
    files = {'zipped_docker_dir': open('docker_dir.tar','rb')}
    values = { 'build_arguments': args }
    requests.post(SERVER_URL, files=files, data=values)

def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)
