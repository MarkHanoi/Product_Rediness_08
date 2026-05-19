using System;
using System.Runtime.InteropServices;
using System.Text;

namespace PRYZM.Revit.Bridge.UI
{
    /// <summary>
    /// Thin wrapper around the Windows Credential Manager (advapi32.dll).
    /// Stores the PRYZM API token under a generic credential target so it
    /// is encrypted at rest by DPAPI and accessible only to the current
    /// Windows user.
    /// </summary>
    internal static class CredentialStore
    {
        private const int CRED_TYPE_GENERIC = 1;
        private const int CRED_PERSIST_LOCAL_MACHINE = 2;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct CREDENTIAL
        {
            public uint Flags;
            public uint Type;
            public string TargetName;
            public string Comment;
            public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
            public uint CredentialBlobSize;
            public IntPtr CredentialBlob;
            public uint Persist;
            public uint AttributeCount;
            public IntPtr Attributes;
            public string TargetAlias;
            public string UserName;
        }

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "CredWriteW")]
        private static extern bool CredWrite(ref CREDENTIAL credential, uint flags);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "CredReadW")]
        private static extern bool CredRead(string target, uint type, uint reservedFlag, out IntPtr credential);

        [DllImport("advapi32.dll", SetLastError = true, EntryPoint = "CredFree")]
        private static extern void CredFree(IntPtr cred);

        public static void SaveToken(string targetName, string token)
        {
            byte[] tokenBytes = Encoding.Unicode.GetBytes(token ?? string.Empty);
            IntPtr blob = Marshal.AllocCoTaskMem(tokenBytes.Length);
            try
            {
                Marshal.Copy(tokenBytes, 0, blob, tokenBytes.Length);
                var credential = new CREDENTIAL
                {
                    Type = CRED_TYPE_GENERIC,
                    TargetName = targetName,
                    UserName = "pryzm",
                    CredentialBlobSize = (uint)tokenBytes.Length,
                    CredentialBlob = blob,
                    Persist = CRED_PERSIST_LOCAL_MACHINE,
                };
                if (!CredWrite(ref credential, 0))
                {
                    int err = Marshal.GetLastWin32Error();
                    throw new System.ComponentModel.Win32Exception(err);
                }
            }
            finally
            {
                Marshal.FreeCoTaskMem(blob);
            }
        }

        public static string LoadToken(string targetName)
        {
            if (!CredRead(targetName, CRED_TYPE_GENERIC, 0, out IntPtr credPtr))
            {
                return string.Empty;
            }
            try
            {
                var cred = (CREDENTIAL)Marshal.PtrToStructure(credPtr, typeof(CREDENTIAL));
                byte[] buffer = new byte[cred.CredentialBlobSize];
                Marshal.Copy(cred.CredentialBlob, buffer, 0, buffer.Length);
                return Encoding.Unicode.GetString(buffer);
            }
            finally
            {
                CredFree(credPtr);
            }
        }
    }
}
