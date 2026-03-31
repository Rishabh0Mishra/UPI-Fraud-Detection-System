#!/bin/bash

# Define paths
PROJECT_ROOT=$(pwd)
API_DIR="$PROJECT_ROOT/api"
UI_DIR="$PROJECT_ROOT/graphfraud-ui"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}Starting UPI Fraud Detection System...${NC}"

# Start Backend API
echo -e "${GREEN}Starting FastAPI backend...${NC}"
cd "$API_DIR" || exit
python3 -m uvicorn 05_realtime_api:app --host 0.0.0.0 --port 8000 --reload &
API_PID=$!

sleep 2

# Start Frontend UI
echo -e "${GREEN}Starting Vite frontend...${NC}"
cd "$UI_DIR" || { echo "Failed to navigate to UI directory"; exit 1; }
npm run dev &
UI_PID=$!

echo -e "\n${GREEN}==========================================${NC}"
echo -e "${GREEN}System is running!${NC}"
echo -e "Backend API is available at: ${BLUE}http://localhost:8000${NC}"
echo -e "Frontend UI is running on Vite port (usually http://localhost:5173)${NC}"
echo -e "${GREEN}==========================================${NC}"
echo -e "${RED}Press Ctrl+C to stop both servers.${NC}\n"

cleanup() {
    echo -e "\n${RED}Stopping servers...${NC}"
    kill $API_PID $UI_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

wait $API_PID $UI_PID
