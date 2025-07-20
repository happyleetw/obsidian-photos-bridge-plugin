import { 
	PhotosResponse, 
	ExportRequest, 
	ExportResponse, 
	BridgeHealthResponse,
	MediaFilter
} from './types';

export class BridgeAPI {
	private baseUrl: string;

	constructor(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
	}

	updateBaseUrl(baseUrl: string) {
		this.baseUrl = baseUrl.replace(/\/$/, '');
	}

	// Health check
	async checkHealth(): Promise<BridgeHealthResponse> {
		const response = await fetch(`${this.baseUrl}/api/health`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			throw new Error(`Health check failed: ${response.statusText}`);
		}

		return response.json();
	}

	// Get photos
	async getPhotos(
		page: number = 1, 
		pageSize: number = 50,
		filter?: MediaFilter
	): Promise<PhotosResponse> {
		const params = new URLSearchParams();
		params.append('page', page.toString());
		params.append('pageSize', pageSize.toString());
		
		if (filter?.mediaType && filter.mediaType !== 'all') {
			params.append('mediaType', filter.mediaType);
		}

		const url = `${this.baseUrl}/api/photos?${params.toString()}`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to get photos: ${response.statusText}`);
		}

		return response.json();
	}

	// Search photos
	async searchPhotos(
		query: string,
		page: number = 1,
		pageSize: number = 50
	): Promise<PhotosResponse> {
		const params = new URLSearchParams();
		params.append('q', query);
		params.append('page', page.toString());
		params.append('pageSize', pageSize.toString());

		const url = `${this.baseUrl}/api/photos/search?${params.toString()}`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to search photos: ${response.statusText}`);
		}

		return response.json();
	}

	// Get photos by date
	async getPhotosByDate(
		dateString: string,
		page: number = 1,
		pageSize: number = 50
	): Promise<PhotosResponse> {
		const params = new URLSearchParams();
		params.append('date', dateString);
		params.append('page', page.toString());
		params.append('pageSize', pageSize.toString());

		const url = `${this.baseUrl}/api/photos/date?${params.toString()}`;
		
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to get photos by date: ${response.statusText}`);
		}

		return response.json();
	}

	// Get thumbnail URL
	getThumbnailUrl(photoId: string): string {
		return `${this.baseUrl}/api/thumbnails/${encodeURIComponent(photoId)}`;
	}

	// Get original image URL
	getOriginalUrl(photoId: string): string {
		return `${this.baseUrl}/api/photos/${encodeURIComponent(photoId)}/original`;
	}

	// Download thumbnail as blob
	async getThumbnail(photoId: string): Promise<Blob> {
		const response = await fetch(this.getThumbnailUrl(photoId));
		
		if (!response.ok) {
			throw new Error(`Failed to get thumbnail: ${response.statusText}`);
		}

		return response.blob();
	}

	// Download original image as blob
	async getOriginal(photoId: string): Promise<Blob> {
		const response = await fetch(this.getOriginalUrl(photoId));
		
		if (!response.ok) {
			throw new Error(`Failed to get original image: ${response.statusText}`);
		}

		return response.blob();
	}

	// Export photo to destination
	async exportPhoto(
		photoId: string,
		destination: string,
		filename?: string,
		keepOriginalName?: boolean
	): Promise<ExportResponse> {
		const exportRequest: ExportRequest = {
			destination,
			filename,
			keepOriginalName
		};

		const response = await fetch(
			`${this.baseUrl}/api/photos/${encodeURIComponent(photoId)}/export`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(exportRequest)
			}
		);

		if (!response.ok) {
			throw new Error(`Failed to export photo: ${response.statusText}`);
		}

		return response.json();
	}

	// Test connection
	async testConnection(): Promise<boolean> {
		try {
			await this.checkHealth();
			return true;
		} catch (error) {
			console.error('Bridge connection test failed:', error);
			return false;
		}
	}

	// Get connection info
	async getConnectionInfo(): Promise<{ connected: boolean; version?: string; error?: string }> {
		try {
			const health = await this.checkHealth();
			return {
				connected: true,
				version: health.version
			};
		} catch (error) {
			return {
				connected: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}
} 