import click 


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
        return run_custom_build_logic()
    
    return fallback_to_docker(cmd)

def run_custom_build_logic():
    # check if email is in ~/.vdiff/config.json, if not, prompt for corporate email address and write it to that file.
    click.echo('runing custom build logic')

def fallback_to_docker(cmd):
    click.echo('falling back to docker')
