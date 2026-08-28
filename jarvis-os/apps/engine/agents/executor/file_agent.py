"""
File Agent - File system operations
"""

import logging
import os
import shutil
from typing import Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class FileAgent:
    """
    File Agent: Handles all file system operations.
    """
    
    def __init__(self, execution_engine: Any):
        self.execution_engine = execution_engine
    
    async def execute(
        self,
        action: str,
        params: Dict[str, Any],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a file operation.
        
        Args:
            action: The action to perform
            params: Action parameters
            context: Execution context
            
        Returns:
            Execution result
        """
        try:
            if action == 'create_file' or action == 'write_file':
                return await self._create_file(params)
            elif action == 'read_file':
                return await self._read_file(params)
            elif action == 'delete_file':
                return await self._delete_file(params)
            elif action == 'mkdir':
                return await self._mkdir(params)
            elif action == 'list_dir':
                return await self._list_dir(params)
            elif action == 'copy_file':
                return await self._copy_file(params)
            elif action == 'move_file':
                return await self._move_file(params)
            elif action == 'analyze_folder':
                return await self._analyze_folder(params)
            elif action == 'organize_files':
                return await self._organize_files(params)
            else:
                return {
                    'success': False,
                    'error': f'Unknown file action: {action}'
                }
        except Exception as e:
            logger.error(f"File operation error ({action}): {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def _create_file(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create a file with content"""
        path = params.get('path')
        content = params.get('content', '')
        
        if not path:
            return {'success': False, 'error': 'No path specified'}
        
        # Ensure directory exists
        dir_path = os.path.dirname(path)
        if dir_path:
            os.makedirs(dir_path, exist_ok=True)
        
        # Write file
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        return {
            'success': True,
            'output': {'path': path, 'size': len(content)}
        }
    
    async def _read_file(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Read file contents"""
        path = params.get('path')
        
        if not path:
            return {'success': False, 'error': 'No path specified'}
        
        if not os.path.exists(path):
            return {'success': False, 'error': f'File not found: {path}'}
        
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        return {
            'success': True,
            'output': {'content': content, 'size': len(content)}
        }
    
    async def _delete_file(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Delete a file"""
        path = params.get('path')
        
        if not path:
            return {'success': False, 'error': 'No path specified'}
        
        if os.path.exists(path):
            os.remove(path)
            return {'success': True, 'output': {'deleted': path}}
        else:
            return {'success': False, 'error': f'File not found: {path}'}
    
    async def _mkdir(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Create directory"""
        path = params.get('path')
        
        if not path:
            return {'success': False, 'error': 'No path specified'}
        
        os.makedirs(path, exist_ok=True)
        
        return {'success': True, 'output': {'created': path}}
    
    async def _list_dir(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """List directory contents"""
        path = params.get('path', '.')
        
        if not os.path.exists(path):
            return {'success': False, 'error': f'Directory not found: {path}'}
        
        items = []
        for item in os.listdir(path):
            item_path = os.path.join(path, item)
            items.append({
                'name': item,
                'type': 'directory' if os.path.isdir(item_path) else 'file',
                'size': os.path.getsize(item_path) if os.path.isfile(item_path) else None
            })
        
        return {'success': True, 'output': {'items': items, 'path': path}}
    
    async def _copy_file(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Copy file from source to destination"""
        source = params.get('source')
        destination = params.get('destination')
        
        if not source or not destination:
            return {'success': False, 'error': 'Source and destination required'}
        
        shutil.copy2(source, destination)
        
        return {
            'success': True,
            'output': {'source': source, 'destination': destination}
        }
    
    async def _move_file(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Move file from source to destination"""
        source = params.get('source')
        destination = params.get('destination')
        
        if not source or not destination:
            return {'success': False, 'error': 'Source and destination required'}
        
        shutil.move(source, destination)
        
        return {
            'success': True,
            'output': {'source': source, 'destination': destination}
        }
    
    async def _analyze_folder(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze folder structure and content"""
        path = params.get('path', '.')
        
        if not os.path.exists(path):
            return {'success': False, 'error': f'Path not found: {path}'}
        
        stats = {
            'total_files': 0,
            'total_dirs': 0,
            'total_size': 0,
            'extensions': {}
        }
        
        for root, dirs, files in os.walk(path):
            stats['total_dirs'] += len(dirs)
            for file in files:
                stats['total_files'] += 1
                file_path = os.path.join(root, file)
                try:
                    size = os.path.getsize(file_path)
                    stats['total_size'] += size
                    
                    ext = os.path.splitext(file)[1].lower()
                    if ext not in stats['extensions']:
                        stats['extensions'][ext] = {'count': 0, 'size': 0}
                    stats['extensions'][ext]['count'] += 1
                    stats['extensions'][ext]['size'] += size
                except:
                    pass
        
        return {'success': True, 'output': stats}
    
    async def _organize_files(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Organize files by rules"""
        path = params.get('path', '.')
        rules = params.get('rules', {})
        
        # Default: organize by extension
        if not rules:
            rules = {'by_extension': True}
        
        moved_count = 0
        
        if rules.get('by_extension'):
            for item in os.listdir(path):
                item_path = os.path.join(path, item)
                if os.path.isfile(item_path):
                    ext = os.path.splitext(item)[1].lower() or 'no_extension'
                    ext_dir = os.path.join(path, ext.lstrip('.'))
                    
                    os.makedirs(ext_dir, exist_ok=True)
                    
                    dest = os.path.join(ext_dir, item)
                    if not os.path.exists(dest):
                        shutil.move(item_path, dest)
                        moved_count += 1
        
        return {
            'success': True,
            'output': {'organized': True, 'moved_count': moved_count}
        }
