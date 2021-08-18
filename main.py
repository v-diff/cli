import os 
import click 
import subprocess
import getpass 
import shutil 

# @click.group() works just like @click.command() except @click.group() can have subcommands 
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
    # check if email is in ~/.vdiff/config.json, if not, prompt for corporate email address and write it to that file.
    # if not os.path.exists("~/.vdiff/config.json"):
    #     # prompt user 
    #     email = click.prompt(
    #         "Enter your corporate email address",
    #     )
    #     os.mkdir("/.vdiff")
    #     f = open("~/.vdiff/config.json", "x")
    #     f.write(email)
    #     f.close()
    username = ''
    try:
        username = getpass.getuser()
    except:
        username = 'not_found'

    # make a POST request to our server
    args = list(args)
    zipped = shutil.make_archive('docker_dir', 'tar')
    # send it 
    
    # delete docker_dir locally


def fallback_to_docker(cmd):
    subprocess.call("docker " + ' '.join(cmd), shell=True)
