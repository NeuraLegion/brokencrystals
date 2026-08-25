import type { ChangeEvent, FC } from 'react';
import { useState } from 'react';
import Header from '../main/Header/Header';
import { postHiddenUpload } from '../../api/httpClient';
import type { HiddenUploadResponse } from '../../interfaces/HiddenUploadResponse';

const HiddenUpload: FC = () => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HiddenUploadResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<{
    content: string;
    isSvg: boolean;
  } | null>(null);

  const isImageFile = (file: File) =>
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|svg)$/i.test(file.name ?? '');

  const buildPreview = (file: File) =>
    new Promise<{ content: string; isSvg: boolean }>((resolve, reject) => {
      const isSvg =
        file.type.includes('svg') || /\.svg$/i.test(file.name ?? '');
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Could not read file for preview'));
          return;
        }
        resolve({ content: reader.result, isSvg });
      };
      reader.onerror = () =>
        reject(new Error('Could not read file for preview'));

      if (isSvg) {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    setPreview(null);
    setSelectedFile(null);
    setResult(null);

    if (!file) {
      return;
    }

    if (!isImageFile(file)) {
      setError('Only image files are allowed');
      return;
    }

    setError(null);
    setSelectedFile(file);

    try {
      const nextPreview = await buildPreview(file);
      setPreview(nextPreview);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Could not generate preview';
      setError(message);
    }
  };

  const buildUploadFile = (file: File, desiredName: string) =>
    new File([file], desiredName.trim(), { type: file.type });

  const onUpload = async () => {
    if (!selectedFile) {
      setError('Please choose an image before uploading');
      return;
    }

    const trimmedName = fileName.trim();
    if (!trimmedName) {
      setError('Please provide a file name before uploading');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    const fileToUpload = buildUploadFile(selectedFile, trimmedName);

    try {
      const data = await postHiddenUpload(fileToUpload, trimmedName);
      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Header onInnerPage />
      <section className="container" style={{ paddingTop: '96px' }}>
        <div className="section-title">
          <h2>Hidden Upload</h2>
          <p>Upload an image and view it right here after upload.</p>
        </div>

        <div className="card" style={{ maxWidth: 540, margin: '0 auto' }}>
          <div className="card-body">
            <label className="form-label" htmlFor="hidden-upload-name">
              File name
            </label>
            <input
              id="hidden-upload-name"
              type="text"
              className="form-control"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="example.svg"
              disabled={uploading}
            />
            {fileName && (
              <div
                style={{ marginTop: 8 }}
              >
                {fileName}
              />
            )}
            <label
              className="form-label"
              htmlFor="hidden-upload-input"
              style={{ marginTop: 12 }}
            >
              Choose an image
            </label>
            <input
              id="hidden-upload-input"
              type="file"
              accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
              className="form-control"
              onChange={onFileChange}
              disabled={uploading}
            />
            <div style={{ marginTop: 12 }}>
              {error && <div className="text-danger">{error}</div>}
            </div>

            {preview && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    padding: 12,
                    borderRadius: 8
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center'
                    }}
                  >
                    {preview.isSvg ? (
                      <pre style={{ maxWidth: '100%', whiteSpace: 'pre-wrap' }}>
                        {preview.content}
                      </pre>
                    ) : (
                      <img
                        src={preview.content}
                        alt="Preview"
                        style={{ maxWidth: '100%', borderRadius: 4 }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={onUpload}
                disabled={!selectedFile || uploading}
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>

            {result && (
              <div style={{ marginTop: 16 }}>
                <div
                  style={{
                    border: '1px solid #e5e7eb',
                    padding: 12,
                    borderRadius: 8
                  }}
                >
                  <img
                    src={result.content}
                    alt="Uploaded hidden"
                    style={{ maxWidth: '100%' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
};

export default HiddenUpload;
