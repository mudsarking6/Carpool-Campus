$files = @('package.json', 'frontend/package.json', 'backend/package.json', '.gitignore', 'frontend/.gitignore', 'backend/.gitignore')  
foreach ($f in $files) {  
    $content = Get-Content $f -Raw  
    $content = $content -creplace '\uFEFF', ''  
