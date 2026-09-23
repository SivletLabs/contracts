#!/usr/bin/env bash

# ==============================================================================
# SivletLabs $SIVLET Token Launch Script
# 
# Purpose:
#   1. Create SPL Token with 9 decimals on Solana.
#   2. Initialize associated token account (ATA) for deployment authority.
#   3. Mint exactly 1,000,000,000 $SIVLET tokens (1 Billion fixed supply).
#   4. Permanently revoke mint authority (freezing total supply forever).
#   5. Permanently revoke freeze authority (preventing account blacklisting).
#   6. Attach Metaplex Token Metadata V3 (Name, Ticker, Description, Logo URI).
# ==============================================================================

set -euo pipefail

# Text color definitions
BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"
DEPLOYMENT_FILE="${SCRIPT_DIR}/deployment.solana.env"

# Load local environment configuration if present
if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    source "${ENV_FILE}"
fi

# Default Configuration
NETWORK="${SOLANA_NETWORK:-mainnet-beta}"
RPC_URL="${SOLANA_RPC_URL:-https://api.mainnet-beta.solana.com}"
KEYPAIR_PATH="${SOLANA_KEYPAIR_PATH:-${HOME}/.config/solana/id.json}"
MINT_KEYPAIR_PATH="${MINT_KEYPAIR_PATH:-}"

TOKEN_NAME="SivletLabs Token"
TOKEN_SYMBOL="SIVLET"
TOKEN_DECIMALS=9
TOKEN_TOTAL_SUPPLY="1000000000"
TOKEN_LOGO_URI="https://sivletlabs.github.io/assets/logo.png"
METADATA_URI="https://sivletlabs.github.io/assets/token-metadata.json"
TOKEN_DESCRIPTION="SivletLabs (\$SIVLET) - High-throughput System-1 Decision Network and Reinforcement Learning Infrastructure for Autonomous Agents."

log_info() {
    echo -e "${CYAN}${BOLD}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}${BOLD}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}${BOLD}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${CYAN}${BOLD}"
    echo "================================================================================"
    echo "            SivletLabs $SIVLET SPL Token Deployment & Metadata Tool             "
    echo "================================================================================"
    echo -e "${NC}"
}

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --network <name>       Target Solana cluster (mainnet-beta, devnet, testnet). Default: mainnet-beta"
    echo "  --rpc <url>            Solana RPC endpoint. Default: https://api.mainnet-beta.solana.com"
    echo "  --keypair <path>       Fee payer keypair path. Default: ~/.config/solana/id.json"
    echo "  --mint-keypair <path>  Optional custom keypair for deterministic mint address"
    echo "  --metadata-uri <uri>   Off-chain metadata JSON URI"
    echo "  --help, -h             Show this help message"
    exit 0
}

# Parse Command Line Arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --network)
            NETWORK="$2"
            if [[ "${NETWORK}" == "devnet" && "${RPC_URL}" == "https://api.mainnet-beta.solana.com" ]]; then
                RPC_URL="https://api.devnet.solana.com"
            fi
            shift 2
            ;;
        --rpc)
            RPC_URL="$2"
            shift 2
            ;;
        --keypair)
            KEYPAIR_PATH="$2"
            shift 2
            ;;
        --mint-keypair)
            MINT_KEYPAIR_PATH="$2"
            shift 2
            ;;
        --metadata-uri)
            METADATA_URI="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            log_error "Unknown argument: $1"
            usage
            ;;
    esac
done

# Expand tilde in file paths
KEYPAIR_PATH="${KEYPAIR_PATH/#\~/$HOME}"
if [[ -n "${MINT_KEYPAIR_PATH}" ]]; then
    MINT_KEYPAIR_PATH="${MINT_KEYPAIR_PATH/#\~/$HOME}"
fi

check_prerequisites() {
    log_info "Verifying system prerequisites..."

    if ! command -v solana &> /dev/null; then
        log_error "Solana CLI is not installed or not in PATH."
        echo "  Install via: sh -c \"\$(curl -sSfL https://release.anza.xyz/stable/install)\""
        exit 1
    fi

    if ! command -v spl-token &> /dev/null; then
        log_error "spl-token CLI is not installed or not in PATH."
        echo "  Install via: cargo install spl-token-cli"
        exit 1
    fi

    if ! command -v node &> /dev/null; then
        log_error "Node.js is required for Metaplex metadata attachment."
        exit 1
    fi

    if [[ ! -f "${KEYPAIR_PATH}" ]]; then
        log_error "Fee payer keypair file not found at: ${KEYPAIR_PATH}"
        echo "  Generate one via: solana-keygen new --outfile ${KEYPAIR_PATH}"
        exit 1
    fi

    if [[ -n "${MINT_KEYPAIR_PATH}" && ! -f "${MINT_KEYPAIR_PATH}" ]]; then
        log_error "Specified mint keypair file not found at: ${MINT_KEYPAIR_PATH}"
        exit 1
    fi

    # Verify Solana CLI configuration
    solana config set --url "${RPC_URL}" --keypair "${KEYPAIR_PATH}" > /dev/null 2>&1 || true

    # Check authority SOL balance
    local balance_output
    balance_output=$(solana balance "${KEYPAIR_PATH}" --url "${RPC_URL}" 2>/dev/null || echo "0 SOL")
    local balance_val
    balance_val=$(echo "${balance_output}" | awk '{print $1}')

    log_info "Connected Cluster:   ${NETWORK} (${RPC_URL})"
    log_info "Payer / Authority:   $(solana-keygen pubkey "${KEYPAIR_PATH}")"
    log_info "Payer SOL Balance:   ${balance_output}"

    # Basic balance check (requires at least ~0.05 SOL for mint rent, ATA rent, and metadata)
    if (( $(echo "${balance_val} < 0.02" | bc -l 2>/dev/null || echo 1) )); then
        log_warn "Wallet SOL balance is low (${balance_output}). Token creation may fail without rent funding."
    fi
}

deploy_token() {
    log_info "Step 1/5: Creating $SIVLET SPL Token mint with ${TOKEN_DECIMALS} decimals..."
    
    local create_token_cmd=(spl-token create-token --decimals "${TOKEN_DECIMALS}" --fee-payer "${KEYPAIR_PATH}")
    if [[ -n "${MINT_KEYPAIR_PATH}" ]]; then
        create_token_cmd+=("${MINT_KEYPAIR_PATH}")
    fi

    local create_output
    create_output=$("${create_token_cmd[@]}" 2>&1)
    echo "${create_output}"

    # Extract Mint address from output
    MINT_ADDRESS=$(echo "${create_output}" | grep "Creating token" | awk '{print $3}' || true)
    if [[ -z "${MINT_ADDRESS}" ]]; then
        # Fallback search if output format differs
        MINT_ADDRESS=$(echo "${create_output}" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n 1 || true)
    fi

    if [[ -z "${MINT_ADDRESS}" ]]; then
        log_error "Failed to determine Mint Address from command output."
        exit 1
    fi

    log_success "Mint Address successfully created: ${MINT_ADDRESS}"

    # Step 2: Create Associated Token Account
    log_info "Step 2/5: Creating Associated Token Account (ATA) for authority..."
    local create_account_output
    create_account_output=$(spl-token create-account "${MINT_ADDRESS}" --fee-payer "${KEYPAIR_PATH}" 2>&1)
    echo "${create_account_output}"

    ATA_ADDRESS=$(echo "${create_account_output}" | grep "Creating account" | awk '{print $3}' || true)
    if [[ -z "${ATA_ADDRESS}" ]]; then
        ATA_ADDRESS=$(echo "${create_account_output}" | grep -Eo '[1-9A-HJ-NP-Za-km-z]{32,44}' | head -n 1 || true)
    fi
    log_success "Token Account (ATA) initialized: ${ATA_ADDRESS}"

    # Step 3: Mint exactly 1,000,000,000 tokens
    log_info "Step 3/5: Minting ${TOKEN_TOTAL_SUPPLY} $SIVLET tokens to ATA..."
    local mint_output
    mint_output=$(spl-token mint "${MINT_ADDRESS}" "${TOKEN_TOTAL_SUPPLY}" "${ATA_ADDRESS}" --fee-payer "${KEYPAIR_PATH}" 2>&1)
    echo "${mint_output}"

    # Verify circulating supply
    local verified_supply
    verified_supply=$(spl-token supply "${MINT_ADDRESS}" 2>&1)
    log_success "Circulating Supply verified: ${verified_supply} $SIVLET"

    # Step 4: Permanently disable mint authority & freeze authority
    log_info "Step 4/5: Permanently revoking Mint and Freeze Authorities..."
    log_info "Revoking Mint Authority..."
    spl-token authorize "${MINT_ADDRESS}" mint --disable --fee-payer "${KEYPAIR_PATH}"
    
    log_info "Revoking Freeze Authority..."
    spl-token authorize "${MINT_ADDRESS}" freeze --disable --fee-payer "${KEYPAIR_PATH}" || true

    log_success "Authorities revoked. Total supply is permanently frozen at 1,000,000,000."

    # Verify authority status
    echo ""
    log_info "Inspecting on-chain token parameters:"
    spl-token display "${MINT_ADDRESS}" || true
    echo ""

    # Step 5: Upload and bind Metaplex Token Metadata V3
    log_info "Step 5/5: Binding Metaplex Token Metadata V3..."
    log_info "Token Name:    ${TOKEN_NAME}"
    log_info "Token Symbol:  ${TOKEN_SYMBOL}"
    log_info "Logo URI:      ${TOKEN_LOGO_URI}"
    log_info "Metadata URI:  ${METADATA_URI}"

    node "${SCRIPT_DIR}/attach_metadata.js" \
        --mint "${MINT_ADDRESS}" \
        --keypair "${KEYPAIR_PATH}" \
        --rpc "${RPC_URL}" \
        --name "${TOKEN_NAME}" \
        --symbol "${TOKEN_SYMBOL}" \
        --uri "${METADATA_URI}" \
        --immutable

    log_success "Metaplex Metadata bound and permanently locked."

    # Save deployment state
    cat <<EOF > "${DEPLOYMENT_FILE}"
# SivletLabs Solana Deployment Variables
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
SOLANA_NETWORK="${NETWORK}"
SOLANA_RPC_URL="${RPC_URL}"
SIVLET_MINT_ADDRESS="${MINT_ADDRESS}"
SIVLET_AUTHORITY_ATA="${ATA_ADDRESS}"
SIVLET_DECIMALS=${TOKEN_DECIMALS}
SIVLET_TOTAL_SUPPLY="${TOKEN_TOTAL_SUPPLY}"
TOKEN_NAME="${TOKEN_NAME}"
TOKEN_SYMBOL="${TOKEN_SYMBOL}"
TOKEN_LOGO_URI="${TOKEN_LOGO_URI}"
TOKEN_METADATA_URI="${METADATA_URI}"
EOF

    log_success "Deployment configuration saved to: ${DEPLOYMENT_FILE}"

    # Print Final Summary Table
    echo ""
    echo -e "${GREEN}${BOLD}================================================================================"
    echo "                   $SIVLET TOKEN LAUNCH COMPLETED SUCCESSFULLY                   "
    echo "================================================================================${NC}"
    echo -e " Token Name:             ${BOLD}${TOKEN_NAME}${NC}"
    echo -e " Ticker Symbol:          ${BOLD}\$${TOKEN_SYMBOL}${NC}"
    echo -e " Decimals:               ${BOLD}${TOKEN_DECIMALS}${NC}"
    echo -e " Total Supply:           ${BOLD}1,000,000,000${NC} (Fixed Forever)"
    echo -e " Mint Authority:         ${BOLD}${GREEN}DISABLED (Permanently Immutable)${NC}"
    echo -e " Freeze Authority:       ${BOLD}${GREEN}DISABLED (No Blacklists Allowed)${NC}"
    echo -e " Mint Address:           ${CYAN}${BOLD}${MINT_ADDRESS}${NC}"
    echo -e " Creator ATA:            ${CYAN}${ATA_ADDRESS}${NC}"
    echo -e " Solscan Explorer:       ${CYAN}https://solscan.io/token/${MINT_ADDRESS}${NC}"
    echo "================================================================================"
    echo ""
}

main() {
    print_header
    check_prerequisites
    deploy_token
}

main "$@"
