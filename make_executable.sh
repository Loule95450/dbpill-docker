npm run build

npx esbuild run_executable.ts \
       --bundle --platform=node --format=cjs \
       --outfile=server.bundle.cjs
node --experimental-sea-config sea-config.json
cp $(command -v node) dbpill 
codesign --remove-signature dbpill
npx postject dbpill NODE_SEA_BLOB sea-prep.blob        --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2        --macho-segment-name NODE_SEA
codesign --sign - dbpill