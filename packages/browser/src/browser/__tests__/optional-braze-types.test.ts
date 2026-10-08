/** @jest-environment node */
import { resolve } from 'path'
import ts from 'typescript'

it('checks the built public declarations without the optional Braze SDK', () => {
  const options: ts.CompilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    esModuleInterop: true,
    types: [],
    target: ts.ScriptTarget.ES2020,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
  }
  const host = ts.createCompilerHost(options)
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) =>
      name === '@braze/web-sdk'
        ? undefined
        : ts.resolveModuleName(name, containingFile, options, host)
            .resolvedModule
    )
  const program = ts.createProgram(
    [resolve(__dirname, '../../../dist/types/index.d.ts')],
    options,
    host
  )

  expect(
    ts
      .getPreEmitDiagnostics(program)
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      )
  ).toEqual([])
})
