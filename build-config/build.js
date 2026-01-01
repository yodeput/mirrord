const builder = require('electron-builder')
const path = require('path')

/**
 * @type {import('electron-builder').Configuration}
 */
const baseOptions = {
  appId: 'com.mirrord.desktop',
  productName: 'mirrord',
  directories: {
    output: 'out',
    buildResources: 'resources',
  },
  files: [
    'dist/**/*',
    'renderer/**/*',
    'resources/**/*',
    '!node_modules/**/*',
  ],
  extraResources: [
    {
      from: 'resources/scrcpy-server',
      to: 'resources/scrcpy-server',
    },
  ],
  asar: true,
}

const winOptions = {
  win: {
    icon: 'build/icons/icon.ico',
    target: ['nsis', 'portable', '7z'],
  },
  nsis: {
    oneClick: false,
    language: '2052',
    allowToChangeInstallationDirectory: true,
    shortcutName: 'mirrord',
  },
}

const macOptions = {
  mac: {
    icon: 'build/icons/icon.icns',
    target: ['dmg', 'zip'],
    category: 'public.app-category.productivity',
  },
  dmg: {
    title: 'mirrord v${version}',
    window: {
      width: 530,
      height: 380,
    },
    contents: [
      {
        x: 140,
        y: 200,
      },
      {
        x: 390,
        y: 200,
        type: 'link',
        path: '/Applications',
      },
    ],
  },
}

const linuxOptions = {
  linux: {
    icon: 'build/icons',
    maintainer: 'Yogi Dewansyah <yodeput@gmail.com>',
    target: ['AppImage', 'deb'],
    category: 'Utility',
    desktop: {
      entry: {
        Name: 'mirrord',
        Encoding: 'UTF-8',
      },
    },
  },
  appImage: {
    category: 'Utility',
  },
}

const createTarget = {
  win(arch, type) {
    const options = { ...winOptions }
    switch (type) {
      case 'setup':
        options.win.target = ['nsis']
        options.artifactName = `\${productName}-v\${version}-win-${arch}-setup.\${ext}`
        break
      case 'portable':
        options.win.target = ['portable']
        options.artifactName = `\${productName}-v\${version}-win-${arch}-portable.\${ext}`
        break
      case 'green':
        options.win.target = ['7z']
        options.artifactName = `\${productName}-v\${version}-win-${arch}-green.\${ext}`
        break
      default:
        options.artifactName = `\${productName}-v\${version}-win-${arch}.\${ext}`
    }
    return options
  },
  mac(arch, type) {
    const options = { ...macOptions }
    options.artifactName = `\${productName}-v\${version}-mac-${arch}.\${ext}`
    return options
  },
  linux(arch, type) {
    const options = { ...linuxOptions }
    options.artifactName = `\${productName}-v\${version}-linux-${arch}.\${ext}`
    return options
  },
}

/**
 *
 * @param {'win' | 'mac' | 'linux' | 'dir'} target 构建目标平台
 * @param {'x86_64' | 'x64' | 'x86' | 'arm64' | 'armv7l'} arch 包架构
 * @param {*} type 包类型
 * @param {'onTagOrDraft' | 'always' | 'never'} publishType 发布类型
 */

const build = async (target, arch, type, publishType) => {
  if (target === 'dir') {
    await builder.build({
      dir: true,
      config: { ...baseOptions, ...winOptions, ...macOptions, ...linuxOptions },
    })
    return
  }

  const targetInfo = createTarget[target](arch, type)
  
  await builder.build({
    ...targetInfo.buildOptions,
    publish: publishType ?? 'never',
    x64: arch == 'x64' || arch == 'x86_64',
    ia32: arch == 'x86' || arch == 'x86_64',
    arm64: arch == 'arm64',
    armv7l: arch == 'armv7l',
    config: { ...options, ...targetInfo.options },
  })
}

// Parse CLI arguments: target=win arch=x64 type=setup
const params = {}
process.argv.slice(2).forEach(arg => {
  const [key, value] = arg.split('=')
  params[key] = value
})

if (!params.target) {
  console.log('Usage: node build.js target=[win|mac|linux|dir] arch=[x64|arm64] type=[setup|portable|green]')
  process.exit(1)
}

build(params.target, params.arch, params.type)
  .then(() => console.log('Build completed!'))
  .catch(err => {
    console.error('Build failed:', err)
    process.exit(1)
  })
