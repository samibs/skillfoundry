import os
from .pkgmod import x


def helper():
    return 2


def main():
    return helper() + x() + (1 if os else 0)


class Foo:
    def bar(self):
        return 1
