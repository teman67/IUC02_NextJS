# IUC02: Framework for Curation and Distribution of Reference Datasets

A full-stack web application for RDF data generation, validation, and SHACL shape constraint checking, focusing on reference material datasets for creep properties of single crystal Ni-based superalloys.

## 🎯 Project Overview

This project develops a framework for **reference material data sets** using creep properties of single crystal Ni-based superalloy as an example. The framework provides:

- **(i)** Tools for **evaluating and validating** experimental/modeling methods and their uncertainties
- **(ii)** Systems for **assessing the performance** of analysis, modeling, and simulation tools
- **(iii)** Comprehensive **material descriptions** through metadata schemas and ontologies

The application implements community-driven processes for the definition, identification, and curation of reference material data sets, including metadata, raw data, processed data, and quality assessment routines.

## 🏗️ Architecture

This is a **monorepo** containing:

- **Frontend**: Next.js 14 (React 18) with TypeScript and Tailwind CSS
- **Backend**: FastAPI (Python) with RDF/SHACL validation capabilities
- **Data**: Sample datasets, schemas, and mapping documents

```
IUC02_NextJS/
├── frontend/          # Next.js web application
├── backend/           # FastAPI REST API
├── data/              # Sample data files and schemas
└── README.md          # This file
```

## ✨ Features

### Frontend Features
- 📊 **Interactive Workflow Visualization** - Visual representation of the data generation and validation workflow
- 📁 **File Management** - Browse and download example datasets, schemas, and mapping documents
- ✅ **RDF/SHACL Validation** - Upload or use example RDF data graphs and SHACL shapes for validation
- 🎨 **Modern UI** - Responsive design with Tailwind CSS and smooth animations
- 📱 **Mobile Friendly** - Fully responsive interface

### Backend Features
- 🔍 **RDF Validation** - Validate RDF data against SHACL shapes using pyshacl
- 📄 **File API** - Serve example data files from the data directory
- 🔄 **JSON-LD Conversion** - Convert RDF graphs to JSON-LD format
- 🚀 **Fast & Async** - Built with FastAPI for high performance
- 📡 **CORS Enabled** - Configured for frontend integration

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18.x or higher
- **Python** 3.9 or higher
- **npm** or **yarn** package manager
- **Git**

### Installation

#### 1. Clone the Repository

```bash
git clone https://github.com/teman67/IUC02_NextJS.git
cd IUC02_NextJS
```

#### 2. Backend Setup

```powershell
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv backend
.\backend\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the backend server
uvicorn main:app --reload --port 8000
```

The backend API will be available at `http://localhost:8000`

#### 3. Frontend Setup

```powershell
# Navigate to frontend directory (in a new terminal)
cd frontend

# Install dependencies
npm install

# Run the development server
npm run dev
```

The frontend application will be available at `http://localhost:3000`

## 📖 Usage

### Data Generation Workflow

1. Navigate to **Data Generation** page
2. Browse available files:
   - Creep experiment input files (`.LIS`)
   - Metadata schemas (`.json`)
   - RDF graphs (`.ttl`)
   - SHACL shapes (`.ttl`)
   - Mapping documents
3. Preview and download files as needed

### Data Validation

1. Navigate to **Data Validation** page
2. Choose either:
   - **Upload your own files** (RDF Data Graph and SHACL Shape Graph)
   - **Use example files** from the data directory
3. Click **Validate** to run SHACL validation
4. View validation results:
   - Conformance status (✅ Valid / ❌ Invalid)
   - Detailed validation report
   - JSON-LD representation of the data graph

### API Documentation

Visit `http://localhost:8000/docs` for interactive API documentation (Swagger UI)

Available endpoints:
- `GET /` - API health check
- `GET /api/health` - Detailed health status
- `POST /api/validate` - Validate RDF against SHACL shapes
- `GET /api/files/{filename}` - Retrieve file content from data directory
- `GET /api/files` - List all available files

## 🛠️ Technology Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **HTTP Client**: Axios
- **UI Components**: Custom React components

### Backend
- **Framework**: FastAPI
- **Language**: Python 3.9+
- **RDF Processing**: rdflib 7.0.0
- **SHACL Validation**: pyshacl 0.25.0
- **Data Validation**: Pydantic
- **Server**: Uvicorn

### Data Formats
- **RDF**: Turtle (`.ttl`)
- **Metadata**: JSON Schema
- **Validation**: SHACL shapes
- **Serialization**: JSON-LD

## 📂 Project Structure

### Frontend (`/frontend`)
```
frontend/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx           # Home page
│   │   ├── about/             # About page
│   │   ├── data-generation/   # Data generation workflow
│   │   └── data-validation/   # Validation interface
│   └── components/            # Reusable React components
│       ├── Navigation.tsx     # Navigation bar
│       ├── WorkflowDiagram.tsx
│       ├── BackgroundLogo.tsx
│       └── WarningMessage.tsx
├── public/                    # Static assets
└── package.json              # Dependencies and scripts
```

### Backend (`/backend`)
```
backend/
├── main.py                   # FastAPI application
├── requirements.txt          # Python dependencies
└── backend/                  # Virtual environment
```

### Data (`/data`)
```
data/
├── 2024-09_Schema_IUC02_v1.json          # Metadata schema
├── mapping document.json                  # Mapping document
├── rdfGraph_smallExample.ttl             # Example RDF data
├── shaclShape_smallExample.ttl           # Example SHACL shapes
├── Vh5205_C-95.LIS                       # Creep experiment data
└── Vh5205_C-95_translated.json          # Translated metadata
```

## 🔧 Development

### Frontend Scripts

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Backend Development

```bash
# Run with auto-reload
uvicorn main:app --reload

# Run on specific port
uvicorn main:app --port 8000

# Run with custom host
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Environment Variables

Create `.env.local` in the frontend directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 🧪 Testing

### Testing RDF Validation

You can test the validation endpoint using curl:

```bash
curl -X POST "http://localhost:8000/api/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "rdf_content": "@prefix ex: <http://example.org/> . ex:subject ex:predicate ex:object .",
    "shacl_content": "@prefix sh: <http://www.w3.org/ns/shacl#> ..."
  }'
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is part of the NFDI-MatWerk initiative.

## 🔗 Related Links

- **Git Repository**: [https://git.rwth-aachen.de/nfdi-matwerk/iuc02](https://git.rwth-aachen.de/nfdi-matwerk/iuc02)
- **NFDI-MatWerk**: National Research Data Infrastructure for Materials Science & Engineering

## 📧 Contact

For questions and support, please refer to the main IUC02 repository.

## 🙏 Acknowledgments

This project uses data from:
- **PP18 BAM**: Bundesanstalt für Materialforschung und -prüfung
- **PP01 SFB/TR103**: Collaborative Research Centre on Ni-based superalloys

---

**Built with ❤️ for materials science research and data standardization**