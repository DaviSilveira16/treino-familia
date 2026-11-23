@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Treino Familia - Commit, testes e push

pushd "%~dp0"
if errorlevel 1 (
  echo Nao foi possivel abrir a pasta do projeto.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 goto :sem_node
where npm.cmd >nul 2>&1
if errorlevel 1 goto :sem_node
where git >nul 2>&1
if errorlevel 1 goto :sem_git
if not exist "node_modules\" goto :sem_dependencias

echo Este fluxo adiciona todos os arquivos alterados e novos nao ignorados.
echo Voce informa o commit e confirma o push. Os testes rodam antes do envio.
echo.
call npm.cmd run publicar
set "codigoPublicacao=%errorlevel%"
goto :encerrar

:sem_node
echo Instale o Node.js na versao indicada em .nvmrc, com npm, e abra novamente.
set "codigoPublicacao=1"
goto :encerrar

:sem_git
echo Instale o Git e abra novamente este arquivo.
set "codigoPublicacao=1"
goto :encerrar

:sem_dependencias
echo Execute na pasta do projeto: npm ci --ignore-scripts
echo Depois execute: npm run test:browsers
set "codigoPublicacao=1"
goto :encerrar

:encerrar
echo.
if not "%codigoPublicacao%"=="0" echo Fluxo interrompido. Corrija o erro acima e execute novamente.
popd
pause
exit /b %codigoPublicacao%
