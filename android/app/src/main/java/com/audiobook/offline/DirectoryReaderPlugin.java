package com.audiobook.offline;

import android.media.MediaMetadataRetriever;
import android.net.Uri;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import androidx.documentfile.provider.DocumentFile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DirectoryReader")
public class DirectoryReaderPlugin extends Plugin {

    @PluginMethod
    public void listFiles(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Path is required");
            return;
        }

        try {
            Uri treeUri = Uri.parse(path);
            DocumentFile dir = DocumentFile.fromTreeUri(getContext(), treeUri);

            if (dir == null || !dir.isDirectory()) {
                call.reject("Not a valid directory");
                return;
            }

            String rootName = dir.getName() != null ? dir.getName() : "未知书籍";
            JSArray filesArray = new JSArray();
            scanDirectory(dir, rootName, filesArray);

            JSObject result = new JSObject();
            result.put("files", filesArray);
            result.put("folderName", rootName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to list files: " + e.getMessage());
        }
    }

    @PluginMethod
    public void copyFile(PluginCall call) {
        String uri = call.getString("uri");
        String destName = call.getString("destName");
        if (uri == null || destName == null) {
            call.reject("uri and destName are required");
            return;
        }

        InputStream is = null;
        FileOutputStream fos = null;
        try {
            Uri sourceUri = Uri.parse(uri);
            is = getContext().getContentResolver().openInputStream(sourceUri);
            if (is == null) {
                call.reject("Cannot open source file");
                return;
            }

            File destDir = new File(getContext().getFilesDir(), "audiobooks");
            if (!destDir.exists()) destDir.mkdirs();
            File destFile = new File(destDir, destName);

            fos = new FileOutputStream(destFile);
            byte[] buffer = new byte[8192];
            int bytesRead;
            long totalSize = 0;
            while ((bytesRead = is.read(buffer)) != -1) {
                fos.write(buffer, 0, bytesRead);
                totalSize += bytesRead;
            }
            fos.flush();

            // Extract duration using MediaMetadataRetriever (fast, native)
            long durationMs = 0;
            MediaMetadataRetriever mmr = new MediaMetadataRetriever();
            try {
                mmr.setDataSource(destFile.getAbsolutePath());
                String durStr = mmr.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_DURATION);
                if (durStr != null) durationMs = Long.parseLong(durStr);
            } catch (Exception ignored) {
            } finally {
                try { mmr.release(); } catch (Exception ignored) {}
            }

            JSObject result = new JSObject();
            result.put("path", destFile.getAbsolutePath());
            result.put("size", totalSize);
            result.put("duration", durationMs / 1000.0);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to copy file: " + e.getMessage());
        } finally {
            try { if (is != null) is.close(); } catch (Exception ignored) {}
            try { if (fos != null) fos.close(); } catch (Exception ignored) {}
        }
    }

    /**
     * Recursively scan directory. Each file gets a "group" field set to
     * its immediate parent directory name. Files directly in the root
     * use the root folder name as group.
     */
    private void scanDirectory(DocumentFile dir, String groupName, JSArray filesArray) {
        if (dir == null) return;
        DocumentFile[] children = dir.listFiles();
        if (children == null) return;

        for (DocumentFile child : children) {
            if (child.isFile()) {
                try {
                    JSObject fileObj = new JSObject();
                    fileObj.put("name", child.getName());
                    fileObj.put("uri", child.getUri().toString());
                    fileObj.put("size", child.length());
                    fileObj.put("mimeType", child.getType() != null ? child.getType() : "application/octet-stream");
                    fileObj.put("group", groupName);
                    filesArray.put(fileObj);
                } catch (Exception ignored) {}
            } else if (child.isDirectory()) {
                String childName = child.getName() != null ? child.getName() : groupName;
                scanDirectory(child, childName, filesArray);
            }
        }
    }
}
