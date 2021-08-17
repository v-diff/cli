from setuptools import setup, find_packages

with open("requirements.txt", "r", encoding="utf-8") as fh:
    requirements = fh.read()
setup(
    name = 'vdiff',
    version = '0.0.1',
    author = 'Sunny Rekhi',
    author_email = 'sunny@usevdiff.com',
    py_modules = ['main'],
    packages = find_packages(),
    install_requires = [requirements],
    python_requires='>=3.7',
    classifiers=[
        "Programming Language :: Python :: 3.8",
        "Operating System :: OS Independent",
    ],
    # entry points gives metadata for setuptools
    # console_scripts is used by setuptools to automatically created CLI executables
    entry_points = '''
        [console_scripts]
        vdiff=main:cli
    '''
)