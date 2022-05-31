import turbowalk, { IEntry } from 'turbowalk';

export async function walkDirPath(dirPath: string): Promise<IEntry[]> {
  let fileEntries: IEntry[] = [];
  await turbowalk(dirPath, (entries: IEntry[]) => {
    fileEntries = fileEntries.concat(entries);
  })
  .catch({ systemCode: 3 }, () => Promise.resolve())
  .catch(err => ['ENOTFOUND', 'ENOENT'].includes(err.code)
    ? Promise.resolve() : Promise.reject(err));

  return fileEntries;
}
