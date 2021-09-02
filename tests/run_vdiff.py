import os
real_containers_example_1 = ['build', './sample_repos/web_server', '-f', './sample_repos/web_server/Dockerfile', '-t', 'test1']
real_containers_example_2 = ['build', '-f', './sample_repos/UI/dockerfile', '-t', 'varun', '-q', './sample_repos/UI']

#Not working container
#commenting out because -o still currently works
#real_containers_example_3 = ['build', '-f', './sample_repos/UI/dockerfile', '-t', 'varun', '-q', './sample_repos/UI']
real_containers_example_4 = ['build', '-f', './sample_repos/UI', '-t', 'varun', '-q', './sample_repos']
real_containers_example_5 = ['build', '-q']

os.system("vdiff build ./sample_repos/web_server -f ./sample_repos/web_server/Dockerfile -t test1")
os.system("vdiff build  -f ./sample_repos/UI/dockerfile -t varun -q ./sample_repos/UI")
print("[Failed Cases Below]")
os.system("vdiff build -f ./sample_repos/UI -t varun -q ./sample_repos")
os.system("vdiff build -q")