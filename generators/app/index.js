'use strict';

const _ = require('lodash');
const path = require('path');
const ini = require('ini');
const YeomanGenerator = require('yeoman-generator');

module.exports = class Generator extends YeomanGenerator {
  constructor() {
    super(...arguments);
    this.package = {};
  }

  initializing() {
    normalizeOptions(this.options);

    const defaults = getDefaults(this.destinationRoot(), this.options);
    const existing = this.fs.readJSON('package.json');

    if (!this.options.repository && this.fs.exists('.git/config')) {
      this.options['skip-repo'] = true;
      _.merge(this.options, getRepositoryInformationFromGit(this.fs));
    }

    const options = _.reduce(
      this.options,
      (memo, v, k) =>
        k.indexOf('skip-') === 0 ? memo : _.extend(memo, { [k]: v }),
      {}
    );

    if (this.options['skip-test']) {
      delete defaults.scripts.test;
    }

    _.merge(this.package, defaults, existing, options);
  }

  async prompting() {
    const prompts = [
      ['name', 'package name'],
      ['version'],
      ['displayName', 'user-friendly name'],
      ['description'],
      ['unity', 'unity version'],
      ['repo', 'git repository'],
      [
        'keywords',
        'keywords (space-delimited)',
        this.package.keywords ? this.package.keywords.join(' ') : ''
      ],
      ['author'],
      ['license']
    ]
      .filter(([name]) => !this.options[`skip-${name}`])
      .map(([name, message = name, defaultV = this.package[name]]) => ({
        type: 'input',
        name,
        message: `${message}:`,
        default: defaultV
      }));

    // TODO: refactor loop
    /* eslint-disable no-constant-condition */
    while (true) {
      /* eslint-disable no-await-in-loop */
      const res = await this.prompt(prompts);

      if (res.keywords && !res.keywords.match(/^\w?$/)) {
        res.keywords = res.keywords.split(' ');
      }

      if (res.repo) {
        res.repository = res.repo;
        delete res.repo;
      }

      let pkg = _.merge({}, this.package, res);

      // Strip extraneous props
      pkg = _.reduce(
        [
          'name',
          'version',
          'displayName',
          'description',
          'unity',
          'repository',
          'bugs',
          'homepage',
          'keywords',
          'author',
          'license',
          'dependencies'
        ],
        (accum, k) => _.extend(accum, { [k]: pkg[k] }),
        {}
      );

      /* eslint-disable no-await-in-loop */
      const { confirmed } = await this.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: JSON.stringify(pkg, null, 2) + '\n\nIs this OK?',
          default: true
        }
      ]);

      if (confirmed) {
        this.package = pkg;
        /* eslint-disable no-await-in-loop */
        this.companyName = await this.prompt([
          {
            type: 'input',
            name: 'companyName',
            message: 'company name (for .asmdef)',
            default: toTitleCase(res.author).replace(/\s/g, ''),
            store: true
          }
        ]);
        break;
      } else {
        // Set defaults to the values passed, so if only one field was messed up
        // the user doesn't have to retype the whole thing
        prompts.forEach(p => {
          // Keywords
          if (Array.isArray(pkg[p.name])) {
            p.default = pkg[p.name].join(' ');
          } else {
            p.default = pkg[p.name];
          }
        });
      }
    }
  }

  writing() {
    this.fs.writeJSON(this.destinationPath('package.json'), this.package);
  }
};

function normalizeOptions(options) {
  const aliases = {
    repository: options.repo
  };
  _.merge(options, aliases);
  delete options.repo;
  delete options.test;
}

function getDefaults(fd, options) {
  const basename = path.basename(fd);
  return _.reduce(
    {
      name: basename,
      version: '1.0.0',
      displayName: toTitleCase(basename),
      description: '',
      unity: '',
      keywords: [],
      license: 'MIT',
      dependencies: {}
    },
    (memo, v, k) => (options[`skip-${k}`] ? memo : _.extend(memo, { [k]: v })),
    {}
  );
}

function getRepositoryInformationFromGit(fs) {
  const gitConfigIni = fs.read('.git/config');
  const gitConfig = ini.parse(gitConfigIni);
  const url = gitConfig['remote "origin"']
    ? gitConfig['remote "origin"'].url
    : '';
  const returnValue = {
    repository: {
      type: 'git',
      url
    }
  };
  try {
    const repo = url.match(/github\.com[:/](.+)/i)[1].replace(/\.git$/, '');
    if (url.includes('github.com')) {
      returnValue.bugs = {
        url: `https://github.com/${repo}/issues`
      };
      returnValue.homepage = `https://github.com/${repo}#readme`;
    }
  } finally {
    /* eslint-disable no-unsafe-finally */
    return returnValue;
  }
}

function toTitleCase(string) {
  return string.replace(/\w\S*/g, txt => {
    return txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase();
  });
}
