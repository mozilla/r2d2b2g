# Running a Fork #

1. Fork on github: https://github.com/mozilla/r2d2b2g
2. clone your fork: `git clone git@github.com:your_github_username_here/r2d2b2g.git`
3. set r2d2b2g/master as upstream: `git remote add --track master upstream https://github.com/mozilla/r2d2b2g.git`
4. Make a new directory for your firefox profile outside of the cloned fork. ex. `mkdir arbitraryProfileName`
5. cd into your cloned fork
6. initialize submodules `git submodule init && git submodule update`
7. make `make`
8. initialize addon sdk `cd addon-sdk && . bin/activate`
9. change into addon dir `cd ../addon`
10. Run it! `cfx run --templatedir template/ --profiledir ../../arbitraryProfileName/`

Note: to close it use commmand quit in osx, control-c from the command line will not save any newly installed apps.

# Contributing #

Pick up an issue from the [issue tracker](https://github.com/mozilla/r2d2b2g/issues?state=open) and checkout a new branch that describes the issue.
ex. `git checkout -b fixThatBrokenThingYouKnow`

squashed commits preferred, then issue a pull request.
