#!/usr/bin/env ./node_modules/.bin/ts-node --script-mode --transpile-only --files
/* eslint-disable no-undef */

const ex = require('execa')
const S3 = require('aws-sdk/clients/s3')
const fs = require('fs-extra')
const path = require('path')
const mime = require('mime')
const logUpdate = require('log-update')

const PROD_BRANCH_NAME = 'master'

const bucket =
  process.env.NODE_ENV == 'production'
    ? process.env.PROD_BUCKET
    : process.env.STAGE_BUCKET
if (!bucket) throw new Error('Missing one of PROD_BUCKET or STAGE_BUCKET')

const accessKeyId = process.env.AWS_ACCESS_KEY_ID
if (!accessKeyId) throw new Error('Missing AWS_ACCESS_KEY_ID')
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
if (!secretAccessKey) throw new Error('Missing AWS_SECRET_ACCESS_KEY')
const sessionToken = process.env.AWS_SESSION_TOKEN
if (!sessionToken) throw new Error('Missing AWS_SESSION_TOKEN')

const pathPrefix = process.env.PATH_PREFIX ?? 'browser/candidate'

const getBranch = async () =>
  (await ex('git', ['branch', '--show-current'])).stdout

const getSha = async () =>
  (await ex('git', ['rev-parse', '--short', 'HEAD'])).stdout

async function getFiles(dir) {
  const subdirs = await fs.readdir(dir)
  const files = await Promise.all(
    subdirs.map(async (subdir) => {
      const res = path.resolve(dir, subdir)
      return (await fs.stat(res)).isDirectory() ? getFiles(res) : [res]
    })
  )
  return files.reduce((a, f) => a.concat(f, [])).map((f) => f.split(dir)[1])
}

async function upload(meta) {
  const s3 = new S3({
    accessKeyId,
    secretAccessKey,
    sessionToken,
    region: 'us-east-1',
  })

  const files = await getFiles(path.join(process.cwd(), './dist/umd'))
  const total = files.length
  let progress = 0

  const uploads = files.map(async (f) => {
    const filePath = path.join(process.cwd(), './dist/umd', f)

    const options = {
      Bucket: bucket,
      Key: path.join(pathPrefix, meta.branch, f),
      Body: await fs.readFile(filePath),
      ContentType:
        mime.getType(filePath.replace('.gz', '')) || 'application/javascript',
    }

    if (meta.branch !== PROD_BRANCH_NAME) {
      options.CacheControl = 'public,max-age=31536000,immutable'
    }

    if (filePath.includes('.gz')) {
      options.ContentEncoding = 'gzip'
    }

    const output = await s3.putObject(options).promise()

    if (pathPrefix === 'browser/release') {
      // only build "latest" when it's a "release" build
      // put latest version with only 5 minutes caching
      await s3
        .putObject({
          ...options,
          CacheControl: 'public,max-age=300,immutable',
          Key: path.join(pathPrefix, 'latest', f),
        })
        .promise()
    }

    progress++
    logUpdate(`Progress: ${progress}/${total}`)

    return output
  })

  await Promise.all(uploads)
}

async function release() {
  console.log('Compiling Bundles')

  const sha = await getSha()
  let branch = process.env.GITHUB_REF_NAME ?? (await getBranch())

  const meta = {
    sha,
    branch: `${branch}`,
  }

  console.table(meta)

  console.log('Uploading Assets')
  await upload(meta)
}

release().catch((err) => {
  console.error(err)
  process.exit(1)
})
