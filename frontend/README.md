# IUC02 Hybrid Architecture - Next.js + Python FastAPI

This is a modernized version of the IUC02 Streamlit application, converted to use a hybrid architecture with:
- **Frontend**: Next.js 14 with React, TypeScript, and Tailwind CSS
- **Backend**: Python FastAPI for RDF/SHACL validation

## Project Structure

```
IUC02/
├── nextjs-frontend/          # Next.js frontend application
│   ├── src/
│   │   ├── app/             # Next.js pages (App Router)
│   │   │   ├── page.tsx     # Home page
│   │   │   ├── about/       # About Us page
│   │   │   ├── data-generation/  # Data Generation page
│   │   │   └── data-validation/  # Data Validation page
│   │   └── components/      # Reusable React components
│   ├── public/              # Static assets
│   └── package.json
│
├── python-backend/          # FastAPI backend
│   ├── main.py             # FastAPI application
│   ├── requirements.txt    # Python dependencies
│   └── README.md
│
└── data/                   # Shared data files
    ├── rdfGraph_smallExample.ttl
    ├── shaclShape_smallExample.ttl
    └── ...
```

## Prerequisites

- **Node.js** 18+ and npm/yarn
- **Python** 3.9+
- **pip** (Python package manager)

## Quick Start

### 1. Backend Setup (Python FastAPI)

```bash
# Navigate to backend directory
cd python-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the backend server
python main.py
```

The API will be available at `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`

### 2. Frontend Setup (Next.js)

Open a **new terminal** and:

```bash
# Navigate to frontend directory
cd nextjs-frontend

# Install dependencies
npm install
# or
yarn install

# Create environment file
copy .env.local.example .env.local

# Run the development server
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:3000`

### 3. Copy Images

Make sure to copy the images from the old `images/` directory to `nextjs-frontend/public/images/`:

```bash
# From the root IUC02 directory
mkdir -p nextjs-frontend/public/images
cp images/* nextjs-frontend/public/images/
```

## Features

### Frontend (Next.js)
- ✅ Modern, responsive UI with Tailwind CSS
- ✅ Server-side rendering and static generation
- ✅ Fast page transitions with Next.js App Router
- ✅ TypeScript for type safety
- ✅ Component-based architecture
- ✅ File upload and download functionality
- ✅ Interactive validation interface

### Backend (FastAPI)
- ✅ RESTful API for RDF/SHACL validation
- ✅ File management endpoints
- ✅ PyShacl integration for validation
- ✅ RDFLib for graph parsing
- ✅ Automatic API documentation
- ✅ CORS enabled for frontend communication

## API Endpoints

### Backend API (http://localhost:8000)

- `GET /` - Root endpoint
- `GET /api/health` - Health check
- `POST /api/validate` - Validate RDF against SHACL shapes
  - Body: `{ rdf_content: string, shacl_content: string }`
- `GET /api/files/{filename}` - Get file content
- `GET /api/files` - List all files
- `POST /api/parse-rdf` - Parse RDF file

## Development

### Frontend Development

```bash
cd nextjs-frontend

# Run development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

### Backend Development

```bash
cd python-backend

# Run with auto-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run tests (if available)
pytest
```

## Deployment

### Frontend Deployment (Vercel - Recommended)

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variable: `NEXT_PUBLIC_API_URL=<your-backend-url>`
4. Deploy

### Backend Deployment Options

**Option 1: Traditional Server**
```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

**Option 2: Docker**
```dockerfile
FROM python:3.9
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Option 3: Cloud Functions/Lambda**
- Deploy as AWS Lambda with FastAPI adapter
- Deploy to Google Cloud Functions
- Deploy to Azure Functions

## Migrated Features

- ✅ Home/Summary page with workflow diagram
- ✅ About Us page with team members and logos
- ✅ Data Generation workflow
- ✅ Data Validation with SHACL
- ✅ File upload/download
- ✅ File editing
- ✅ RDF graph parsing
- ✅ SHACL validation
- ✅ JSON-LD export
- ✅ Warning message system
- ✅ Responsive navigation

## Benefits Over Streamlit

1. **Performance**: Faster page loads with Next.js
2. **SEO**: Better search engine optimization
3. **Scalability**: Separate frontend/backend scaling
4. **Modern UI**: Tailwind CSS for responsive design
5. **Type Safety**: TypeScript for fewer bugs
6. **API First**: RESTful API can be used by other clients
7. **Deployment**: More flexible deployment options
8. **Mobile**: Better mobile experience

## Troubleshooting

### CORS Issues
If you encounter CORS errors, make sure:
1. Backend is running on port 8000
2. Frontend is running on port 3000
3. CORS middleware in `python-backend/main.py` includes your frontend URL

### Module Not Found
Frontend:
```bash
cd nextjs-frontend
rm -rf node_modules package-lock.json
npm install
```

Backend:
```bash
cd python-backend
pip install -r requirements.txt
```

### Port Already in Use
Change ports in:
- Backend: `python main.py` or modify in `main.py`
- Frontend: `npm run dev -- -p 3001`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test both frontend and backend
5. Submit a pull request

## License

Same as the original IUC02 project

## Support

For issues or questions:
- Check the Git Repository: https://git.rwth-aachen.de/nfdi-matwerk/iuc02
- Open an issue in the repository
