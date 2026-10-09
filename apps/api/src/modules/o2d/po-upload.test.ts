import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../../config/env.js';
import { O2DPOService, validatePOFile, poFilename } from './po-upload.js';
import { workflowFixture } from './workflow-fixture.js';
import { mapO2DRows } from './repository.js';
const env = parseEnv({
  NODE_ENV: 'test',
  ENABLE_SHEET_WRITES: 'true',
  QUOTATION_PDF_FOLDER_ID: 'configured-folder',
});
const file = {
  name: 'original.pdf',
  mimeType: 'application/pdf',
  content: Buffer.from('%PDF-1.7\nfixture'),
};
function setup(branch: 'FBD' | 'MUM' = 'FBD') {
  const { snapshot } = workflowFixture(branch);
  const repository = {
    load: vi.fn().mockResolvedValue(snapshot),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  const upload = vi
      .fn()
      .mockResolvedValue({
        id: 'new-file',
        url: 'https://drive.google.com/file/d/new-file/view',
      }),
    trash = vi.fn().mockResolvedValue(undefined);
  const row = snapshot.rows[0]!;
  const input = {
    enquiryNo: row.enquiryNo,
    srNo: row.srNo,
    version: row.version,
    type: 'PO' as const,
  };
  return {
    snapshot,
    repository,
    upload,
    trash,
    row,
    input,
    service: new O2DPOService(env, repository, upload, trash),
  };
}
describe('PO upload and exact-row writeback', () => {
  it.each(['FBD', 'MUM'] as const)(
    'uploads PO and revised PO for only the selected %s material',
    async (branch) => {
      for (const type of ['PO', 'REVISED_PO'] as const) {
        const { service, repository, upload, trash, row, input } =
          setup(branch);
        await service.save(branch, row.id, { ...input, type }, file);
        expect(upload).toHaveBeenCalledWith(
          env,
          'configured-folder',
          expect.stringMatching(new RegExp(`C_1_26-27_SR-1_${type}_.*\\.pdf$`)),
          file.content,
          'application/pdf',
        );
        const requests = repository.commit.mock.calls[0]![1];
        const dataWrites = requests.filter(
          (r: { updateCells?: { start: { sheetId: number } } }) =>
            r.updateCells?.start.sheetId === 0,
        );
        expect(dataWrites).toHaveLength(1);
        expect(dataWrites[0].updateCells.start).toEqual({
          sheetId: 0,
          rowIndex: 6,
          columnIndex: type === 'PO' ? 24 : 25,
        });
        expect(JSON.stringify(requests)).toContain(`UPLOAD_${type}`);
        expect(trash).not.toHaveBeenCalled();
      }
    },
  );
  it.each(['PO', 'REVISED_PO'] as const)(
    'audits replacement of %s without deleting the original file',
    async (type) => {
      const { snapshot, repository, upload, trash } = setup();
      snapshot.values[6]![type === 'PO' ? 24 : 25] =
        'https://drive.google.com/file/d/original/view';
      snapshot.formulas[6] = [...snapshot.values[6]!];
      snapshot.rows = mapO2DRows(snapshot);
      const row = snapshot.rows[0]!;
      await new O2DPOService(env, repository, upload, trash).save(
        'FBD',
        row.id,
        {
          enquiryNo: row.enquiryNo,
          srNo: row.srNo,
          type,
          version: row.version,
        },
        file,
      );
      expect(JSON.stringify(repository.commit.mock.calls[0]![1])).toContain(
        `REPLACE_${type}`,
      );
      expect(JSON.stringify(repository.commit.mock.calls[0]![1])).toContain(
        'file/d/original/view',
      );
      expect(trash).not.toHaveBeenCalled();
    },
  );
  it('rejects stale/wrong identities, duplicate identities and protected PO cells before upload', async () => {
    const { service, repository, upload, snapshot, row, input } = setup();
    await expect(
      service.save('FBD', row.id, { ...input, srNo: '2' }, file),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    snapshot.rows.push({ ...row });
    await expect(
      service.save('FBD', row.id, input, file),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    snapshot.rows.pop();
    snapshot.formulas[6]![24] = '=HYPERLINK("https://example.com", "PO")';
    snapshot.rows = mapO2DRows(snapshot);
    await expect(
      service.save(
        'FBD',
        row.id,
        { ...input, version: snapshot.rows[0]!.version },
        file,
      ),
    ).rejects.toMatchObject({ code: 'O2D_FORMULA_PROTECTED' });
    expect(upload).not.toHaveBeenCalled();
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('cleans up only the new upload if the row changes before writing', async () => {
    const { service, repository, trash, snapshot, row, input } = setup();
    const changed = {
      ...snapshot,
      rows: snapshot.rows.map((r) => ({ ...r, version: 'changed' })),
    };
    repository.load
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce(changed);
    await expect(
      service.save('FBD', row.id, input, file),
    ).rejects.toMatchObject({ code: 'ROW_CHANGED' });
    expect(trash).toHaveBeenCalledWith(env, 'new-file');
    expect(repository.commit).not.toHaveBeenCalled();
  });
  it('retains the upload after an uncertain Sheet write and reports an actionable error', async () => {
    const { service, repository, trash, row, input } = setup();
    repository.commit.mockRejectedValue(new Error('timeout'));
    await expect(
      service.save('FBD', row.id, input, file),
    ).rejects.toMatchObject({ code: 'PO_SAVE_UNCONFIRMED' });
    expect(trash).not.toHaveBeenCalled();
  });
  it('does not call Drive when Sheet writes are disabled', async () => {
    const { repository, upload, trash, row, input } = setup();
    await expect(
      new O2DPOService(
        { ...env, ENABLE_SHEET_WRITES: 'false' },
        repository,
        upload,
        trash,
      ).save('FBD', row.id, input, file),
    ).rejects.toMatchObject({ code: 'SHEET_WRITES_DISABLED' });
    expect(upload).not.toHaveBeenCalled();
  });
});
describe('PO file boundaries', () => {
  it.each([
    {
      name: 'image.jpg',
      mimeType: 'image/jpeg',
      content: Buffer.from([255, 216, 255, 0]),
    },
    {
      name: 'image.jpeg',
      mimeType: 'image/jpeg',
      content: Buffer.from([255, 216, 255, 0]),
    },
    {
      name: 'image.png',
      mimeType: 'image/png',
      content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    },
    file,
  ])('accepts supported bytes for $name', (candidate) =>
    expect(validatePOFile(candidate)).toBe(candidate.mimeType),
  );
  it('rejects spoofed content, empty and oversized files', () => {
    expect(() =>
      validatePOFile({ ...file, content: Buffer.from('<html>') }),
    ).toThrow('valid PDF');
    expect(() => validatePOFile({ ...file, content: Buffer.alloc(0) })).toThrow(
      '10 MB',
    );
    expect(() =>
      validatePOFile({ ...file, content: Buffer.alloc(10 * 1024 * 1024 + 1) }),
    ).toThrow('10 MB');
    expect(() => validatePOFile({ ...file, name: 'evil.html' })).toThrow(
      'valid PDF',
    );
  });
  it('sanitizes filename path separators and control characters', () =>
    expect(
      poFilename(
        { enquiryNo: 'C/1:<bad>?\n', srNo: '1', type: 'PO' },
        '.PDF',
        new Date('2026-10-08T00:00:00Z'),
      ),
    ).toBe('C_1__bad____SR-1_PO_2026-10-08T00-00-00-000Z.pdf'));
});
