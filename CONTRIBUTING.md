# Running a Fork #

1. Fork on github https://github.com/mozilla/r2d2b2g
2. clone your fork
`git clone git@github.com:your_github_username_here/r2d2b2g.git`
3. cd into your cloned fork `cd r2d2b2g`
4. set r2d2b2g/master as upstream `git remote add --track master upstream
https://github.com/mozilla/r2d2b2g.git`
5. initialize submodules `git submodule update --init`
6. make `make`
7. Run it! `make run`

Note: to quit the instance of Firefox started by `make run`, use Firefox's
Quit/Exit menu item, as aborting the task on the command line with Control-C
will crash Firefox, and you'll lose changes to the apps on the Dashboard.

## Using Custom Profiles ##

If you need to use a custom Firefox profile, instead run with following command

`PROFILE=/path/to/arbitrary/profile make run`

# Fixing Issues #

Pick up an issue from the
[issue tracker](https://github.com/mozilla/r2d2b2g/issues?state=open) and
check out a new branch that describes the issue.
ex. `git checkout -b fixThatBrokenThingYouKnow`

squashed commits preferred, then issue a pull request.

