import { ThemeProvider } from 'https://esm.sh/@trenaryja/ui'
import React, { useRef, useState } from 'https://esm.sh/react'
import type { CropperState } from 'https://esm.sh/react-advanced-cropper'
import { createRoot } from 'https://esm.sh/react-dom/client'
import type { ProgressInfo } from './background-removal'
import { normalizeFile, runBgRemoval } from './background-removal'
import { isHeicFile, nextFrame, revokeUrls } from './canvas-utils'
import { renderForDownload, triggerDownload } from './image-export'
import { CropStage, DropZone, ErrorStage, LoadingStage, ProcessingStage, ResultStage } from './stages'
import type { Format, ModelSize, Stage } from './types'
import { FORMAT_META } from './types'

const Root = () => {
	const [stage, setStage] = useState<Stage>('idle')
	const [progressInfo, setProgressInfo] = useState<ProgressInfo>({ label: '', percent: null })
	const [error, setError] = useState<string | null>(null)
	const [imageUrl, setImageUrl] = useState<string | null>(null)
	const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
	const [resultUrl, setResultUrl] = useState<string | null>(null)
	const [editedUrl, setEditedUrl] = useState<string | null>(null)
	const [format, setFormat] = useState<Format>('image/png')
	const [bgColor, setBgColor] = useState('#ffffff')
	const [model, setModel] = useState<ModelSize>('medium')
	const inputRef = useRef<HTMLInputElement>(null)
	const downloadBlobUrlRef = useRef<string | null>(null)
	const savedCropperStateRef = useRef<CropperState | null>(null)

	const fail = (err: unknown) => {
		setError(err instanceof Error ? err.message : String(err))
		setStage('error')
	}

	const announce = (label: string) => {
		setStage('processing')
		setProgressInfo({ label, percent: null })
	}

	const handleFile = async (file: File) => {
		try {
			setStage('loading')
			setError(null)
			setProgressInfo({ label: isHeicFile(file) ? 'Converting your photo…' : 'Opening your image…', percent: null })
			await nextFrame()

			setImageUrl(await normalizeFile(file))
			setStage('cropping')
		} catch (error_) {
			fail(error_)
		}
	}

	const processImage = async (inputBlob: Blob, previewUrl: string) => {
		try {
			setStage('processing')
			setError(null)
			setCroppedUrl(previewUrl)
			setProgressInfo({ label: 'Getting ready…', percent: null })
			await nextFrame()

			const resultBlob = await runBgRemoval(inputBlob, model, setProgressInfo)

			setResultUrl(URL.createObjectURL(resultBlob))
			setEditedUrl(null)
			setStage('done')
		} catch (error_) {
			fail(error_)
		}
	}

	const handleBackToCrop = () => {
		revokeUrls([resultUrl, editedUrl, croppedUrl === imageUrl ? null : croppedUrl])
		setResultUrl(null)
		setEditedUrl(null)
		setCroppedUrl(null)
		setStage('cropping')
	}

	const handleEditUpdate = (url: string) => {
		revokeUrls([editedUrl])
		setEditedUrl(url)
	}

	const download = async () => {
		const source = editedUrl ?? resultUrl
		if (!source) return

		const blob = await renderForDownload({ url: source, format, bgColor })
		if (!blob) return

		revokeUrls([downloadBlobUrlRef.current])
		downloadBlobUrlRef.current = triggerDownload(blob, `bg-removed.${FORMAT_META[format].ext}`)
	}

	const reset = () => {
		setStage('idle')
		setProgressInfo({ label: '', percent: null })
		setError(null)
		savedCropperStateRef.current = null

		revokeUrls([imageUrl, resultUrl, croppedUrl, editedUrl, downloadBlobUrlRef.current])
		downloadBlobUrlRef.current = null

		setImageUrl(null)
		setResultUrl(null)
		setCroppedUrl(null)
		setEditedUrl(null)
		if (inputRef.current) inputRef.current.value = ''
	}

	return (
		<ThemeProvider>
			<div className='flex h-screen w-screen flex-col overflow-hidden'>
				{stage === 'idle' && <DropZone inputRef={inputRef} onFile={(file) => void handleFile(file)} />}
				{stage === 'loading' && <LoadingStage label={progressInfo.label} />}
				{stage === 'cropping' && imageUrl && (
					<CropStage
						imageUrl={imageUrl}
						model={model}
						onModelChange={setModel}
						savedStateRef={savedCropperStateRef}
						onStatus={announce}
						onCropped={processImage}
						onError={fail}
						onCancel={reset}
					/>
				)}
				{stage === 'processing' && <ProcessingStage croppedUrl={croppedUrl} progressInfo={progressInfo} />}
				{stage === 'error' && <ErrorStage message={error} onRetry={reset} />}
				{stage === 'done' && resultUrl && (
					<ResultStage
						resultUrl={resultUrl}
						editedUrl={editedUrl}
						croppedUrl={croppedUrl}
						format={format}
						onFormatChange={setFormat}
						bgColor={bgColor}
						onBgColorChange={setBgColor}
						onEditUpdate={handleEditUpdate}
						onBackToCrop={handleBackToCrop}
						onDownload={() => void download().catch(fail)}
						onReset={reset}
					/>
				)}
			</div>
		</ThemeProvider>
	)
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('#root is missing from index.html')
createRoot(rootElement).render(<Root />)
